export function createAdminActionService({
  db,
  findUser,
  findKycUser = findUser,
  activeSession,
  userView,
  reviewQueue,
  customWhitelist,
  kycRepository,
  maxKycAttempts,
  notify,
  audit,
  save,
  saveKyc = save,
  newId,
  persistUser = null,
  persistKyc = null,
  persistKycDecision = null,
  adminMemberMutations = null,
  now = Date.now,
}) {
  function response(status, body) {
    return { status, body };
  }

  async function recordCaseAccess(actor, userId, body = {}) {
    const section = String(body.section || 'overview').slice(0, 40);
    if (adminMemberMutations) {
      const found = await adminMemberMutations.recordCaseAccess({
        actorId: actor.id,
        userId,
        section,
      });
      return found
        ? response(200, { ok: true })
        : response(404, { error: 'Membre introuvable' });
    }
    const user = findUser(userId);
    if (!user) {
      return response(404, { error: 'Membre introuvable' });
    }
    await audit(
      actor.id,
      'admin.member_case.view',
      'user',
      user.id,
      { section },
    );
    save();
    return response(200, { ok: true });
  }

  async function changeRole(actor, userId, body = {}) {
    const role = String(body.role || '').toLowerCase();
    if (!['admin', 'member'].includes(role)) {
      return response(400, { error: 'Role invalide' });
    }

    const becomesAdmin = role === 'admin';
    if (!becomesAdmin && String(userId) === String(actor.id)) {
      return response(400, {
        error:
          'Vous ne pouvez pas retirer votre propre acces '
          + 'administrateur.',
      });
    }
    if (adminMemberMutations) {
      const result = await adminMemberMutations.changeRole({
        actorId: actor.id,
        userId,
        becomesAdmin,
        at: now(),
      });
      if (result.kind === 'not_found') {
        return response(404, { error: 'Compte introuvable' });
      }
      if (result.kind === 'last_admin') {
        return response(400, {
          error: 'Au moins un administrateur doit rester actif.',
        });
      }
      return response(200, {
        user: userView(result.user),
        ...(result.kind === 'unchanged' ? { unchanged: true } : {}),
      });
    }
    const target = findUser(userId);
    if (!target || target.deletedAt) {
      return response(404, { error: 'Compte introuvable' });
    }
    const activeAdmins = db.users.filter(
      (user) => user.isAdmin && !user.deletedAt,
    );
    if (
      !becomesAdmin
      && target.isAdmin
      && activeAdmins.length <= 1
    ) {
      return response(400, {
        error: 'Au moins un administrateur doit rester actif.',
      });
    }
    if (!!target.isAdmin === becomesAdmin) {
      return response(200, {
        user: userView(target),
        unchanged: true,
      });
    }

    target.isAdmin = becomesAdmin;
    target.roleChangedAt = now();
    target.roleChangedBy = actor.id;
    await audit(
      actor.id,
      becomesAdmin ? 'role.admin.grant' : 'role.admin.revoke',
      'user',
      target.id,
      { email: target.email },
    );
    save();
    return response(200, { user: userView(target) });
  }

  async function moderateUser(actor, userId, body = {}) {
    const action = String(body.action || '').trim();
    const reason = String(body.reason || '').trim().slice(0, 500);
    if (!['warn', 'suspend', 'restore'].includes(action)) {
      return response(400, { error: 'Action invalide' });
    }
    if (action !== 'restore' && reason.length < 5) {
      return response(400, {
        error: 'Motif obligatoire (5 caracteres minimum)',
      });
    }

    const timestamp = now();
    const durationHours = action === 'suspend'
      ? Math.max(1, Math.min(24 * 30, Number(body.durationHours || 24)))
      : null;
    if (adminMemberMutations) {
      const result = await adminMemberMutations.moderateUser({
        actorId: actor.id,
        userId,
        action,
        reason,
        durationHours,
        at: timestamp,
      });
      if (result.kind === 'not_found') {
        return response(404, { error: 'Compte introuvable' });
      }
      if (result.kind === 'admin_target') {
        return response(400, {
          error:
            'Un administrateur ne peut pas etre sanctionne '
            + 'depuis cet ecran.',
        });
      }
      return response(200, {
        ok: true,
        user: userView(result.user),
      });
    }
    const target = findUser(userId);
    if (!target || target.deletedAt) {
      return response(404, { error: 'Compte introuvable' });
    }
    if (target.isAdmin) {
      return response(400, {
        error:
          'Un administrateur ne peut pas etre sanctionne '
          + 'depuis cet ecran.',
      });
    }
    if (action === 'suspend') {
      target.suspendedUntil = timestamp + durationHours * 3600e3;
      target.suspensionReason = reason;
      target.suspendedAt = timestamp;
      target.suspendedBy = actor.id;
    } else if (action === 'restore') {
      target.suspendedUntil = null;
      target.suspensionReason = null;
      target.restoredAt = timestamp;
      target.restoredBy = actor.id;
    } else {
      target.lastSafetyWarningAt = timestamp;
      target.lastSafetyWarningReason = reason;
    }
    await audit(
      actor.id,
      `user.safety.${action}`,
      'user',
      target.id,
      {
        reason,
        durationHours: body.durationHours || null,
      },
    );
    save();
    return response(200, {
      ok: true,
      user: userView(target),
    });
  }

  async function submitAppeal(token, body = {}) {
    const session = await activeSession(token);
    const user = session ? findUser(session.userId) : null;
    if (!user) {
      return response(401, { error: 'Non authentifie' });
    }
    const reason = String(body.reason || '').trim().slice(0, 1000);
    if (reason.length < 10) {
      return response(400, {
        error:
          'Expliquez votre recours en au moins 10 caracteres.',
      });
    }
    db.safetyAppeals = db.safetyAppeals || [];
    const existing = db.safetyAppeals.find(
      (appeal) =>
        appeal.userId === user.id && appeal.status === 'open',
    );
    if (existing) {
      return response(409, {
        error: 'Un recours est deja en cours de traitement.',
      });
    }
    const appeal = {
      id: newId('appeal'),
      userId: user.id,
      reason,
      status: 'open',
      createdAt: now(),
    };
    db.safetyAppeals.push(appeal);
    reviewQueue.append({
      type: 'safety_appeal',
      refId: appeal.id,
    });
    await audit(
      user.id,
      'user.safety.appeal',
      'safety_appeal',
      appeal.id,
      {},
    );
    save();
    return response(200, { ok: true, appeal });
  }

  async function reviewAppeal(actor, appealId, body = {}) {
    const appeal = (db.safetyAppeals || []).find(
      (item) => item.id === appealId,
    );
    if (!appeal || appeal.status !== 'open') {
      return response(404, { error: 'Recours introuvable' });
    }
    const decision = String(body.decision || 'reject');
    if (!['approve', 'reject'].includes(decision)) {
      return response(400, { error: 'Decision invalide' });
    }

    appeal.status = decision === 'approve' ? 'accepted' : 'rejected';
    appeal.reviewedAt = now();
    appeal.reviewedBy = actor.id;
    appeal.decisionReason =
      String(body.reason || '').trim().slice(0, 500) || null;
    const user = findUser(appeal.userId);
    if (decision === 'approve' && user) {
      user.suspendedUntil = null;
      user.suspensionReason = null;
      user.messageSafetyBlockedUntil = null;
    }
    const queueItem = reviewQueue.open().find(
      (item) =>
        item.type === 'safety_appeal' && item.refId === appeal.id,
    );
    if (queueItem) {
      reviewQueue.close(queueItem, decision);
    }
    await audit(
      actor.id,
      `user.safety.appeal.${decision}`,
      'safety_appeal',
      appeal.id,
      { userId: appeal.userId },
    );
    save();
    return response(200, { ok: true, appeal });
  }

  async function removeWhitelist(actor, categoryId) {
    const removed = customWhitelist.remove(categoryId);
    if (!removed) {
      return response(404, { error: 'Catégorie introuvable' });
    }
    await audit(
      actor.id,
      'custom_whitelist.remove',
      'custom_whitelist',
      removed.id,
      { label: removed.label },
    );
    save();
    return response(200, { ok: true });
  }

  async function decideKyc(actor, submissionId, body = {}) {
    const submission = await kycRepository.findSubmission(submissionId);
    if (!submission) {
      return response(404, { error: 'Demande introuvable' });
    }
    if (submission.status !== 'pending') {
      return response(400, {
        error: 'Cette demande a déjà été traitée',
      });
    }

    const { decision, reason } = body;
    if (!['approve', 'reject', 'refuse'].includes(decision)) {
      return response(400, { error: 'Décision invalide' });
    }
    if (
      ['reject', 'refuse'].includes(decision)
      && (!reason || String(reason).trim().length < 5)
    ) {
      return response(400, {
        error: 'Motif obligatoire (5 caractères minimum)',
      });
    }

    const user = await findKycUser(submission.userId);
    if (!user) {
      return response(404, { error: 'Utilisateur introuvable' });
    }
    const cleanReason =
      reason ? String(reason).trim().slice(0, 500) : null;
    submission.reviewedBy = actor.id;
    submission.reviewedAt = now();
    submission.decisionReason = cleanReason;
    let notification;

    if (decision === 'approve') {
      submission.status = 'approved';
      user.kycStatus = 'verified';
      notification = { key: 'kyc.verified' };
    } else if (decision === 'reject') {
      submission.status = 'rejected';
      const rejectedCount = await kycRepository.rejectedCountForUser(
        user.id,
      );
      if (rejectedCount >= maxKycAttempts) {
        user.kycStatus = 'refused';
        notification = { key: 'kyc.refusedFinal' };
      } else {
        user.kycStatus = 'rejected';
        notification = {
          key: 'kyc.rejected',
          params: { reason: cleanReason },
        };
      }
    } else {
      submission.status = 'refused';
      user.kycStatus = 'refused';
      notification = {
        key: 'kyc.refused',
        params: { reason: cleanReason },
      };
    }

    const decisionRecord = {
      submissionId: submission.id,
      userId: user.id,
      adminId: actor.id,
      decision,
      reason: cleanReason,
    };
    if (persistKycDecision) {
      await persistKycDecision({
        submission,
        user,
        decision: decisionRecord,
      });
    } else {
      await kycRepository.appendDecision(decisionRecord);
      if (persistKyc) await persistKyc(submission);
      if (persistUser) await persistUser(user);
    }
    await notify([user.id], notification, null, 'security');
    await audit(
      actor.id,
      `kyc.${decision}`,
      'kyc_submission',
      submission.id,
      {
        userId: user.id,
        status: user.kycStatus,
        reason: cleanReason,
      },
    );
    await saveKyc();
    return response(200, {
      ok: true,
      status: user.kycStatus,
    });
  }

  return {
    recordCaseAccess,
    changeRole,
    moderateUser,
    submitAppeal,
    reviewAppeal,
    removeWhitelist,
    decideKyc,
  };
}
