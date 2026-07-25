export function createConversationInboxService({
  db,
  conversationView,
  conversationMessagesPage,
  markConversationRead,
  unreadConversationCount,
  broadcastConversation,
  blockedUserIds,
  findUser,
  publicUser,
  audit,
  save,
}) {
  function findConversation(id, userId, { includeDeleted = true } = {}) {
    return db.conversations.find((conversation) =>
      conversation.id === id
      && conversation.participantIds.includes(userId)
      && (includeDeleted || !(conversation.deletedBy || []).includes(userId))
    ) || null;
  }

  function list(user, query = {}) {
    const filter = String(query.filter || 'all');
    const q = String(query.q || '').trim().toLowerCase();
    const conversations = db.conversations
      .filter((conversation) => conversation.participantIds.includes(user.id))
      .filter((conversation) => !(conversation.deletedBy || []).includes(user.id))
      .map((conversation) => conversationView(conversation, user.id))
      .filter((conversation) =>
        query.includeArchived === '1'
        || filter === 'archived'
        || !conversation.archived
      )
      .filter((conversation) => {
        if (filter === 'unread') return conversation.unreadCount > 0;
        if (filter === 'action') return conversation.actionRequired;
        if (filter === 'pinned') return conversation.pinned;
        if (filter === 'active') {
          return ['active', 'waiting_user', 'waiting_other'].includes(conversation.status);
        }
        if (filter === 'done') {
          return conversation.status === 'completed' || conversation.status === 'archived';
        }
        if (filter === 'archived') return conversation.archived;
        return true;
      })
      .filter((conversation) =>
        !q
        || `${conversation.other?.name || ''} ${conversation.lastMessagePreview || ''} ${conversation.context?.label || ''} ${conversation.context?.detail || ''}`
          .toLowerCase()
          .includes(q)
      )
      .sort((a, b) =>
        Number(b.pinned) - Number(a.pinned)
        || (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt)
      );
    return { conversations };
  }

  function detail(id, userId) {
    const conversation = findConversation(id, userId, { includeDeleted: false });
    if (!conversation) return null;
    return {
      conversation: conversationView(conversation, userId),
    };
  }

  function messages(id, userId, query = {}) {
    const conversation = findConversation(id, userId, { includeDeleted: false });
    if (!conversation) return null;
    const page = conversationMessagesPage(conversation, query);
    if (markConversationRead(conversation.id, userId)) save();
    return {
      conversation: conversationView(conversation, userId),
      ...page,
    };
  }

  function markRead(id, userId) {
    const conversation = findConversation(id, userId);
    if (!conversation) return null;
    if (markConversationRead(conversation.id, userId)) {
      save();
      broadcastConversation(conversation, {
        type: 'read',
        userId,
      });
    }
    return {
      ok: true,
      message: 'Si un compte correspond a cette adresse, un email vient d etre envoye.',
      conversation: conversationView(conversation, userId),
      messagesUnread: unreadConversationCount(userId),
    };
  }

  function typing(id, userId, active) {
    const conversation = findConversation(id, userId);
    if (!conversation) return false;
    broadcastConversation(conversation, {
      type: 'typing',
      userId,
      active: active === true,
    }, userId);
    return true;
  }

  function markUnread(id, userId) {
    const conversation = findConversation(id, userId);
    if (!conversation) return null;
    const lastOther = db.messages
      .filter((message) =>
        message.conversationId === conversation.id
        && message.from !== userId
      )
      .sort((a, b) => b.at - a.at)[0];
    if (lastOther) {
      lastOther.readBy = (lastOther.readBy || []).filter((id) => id !== userId);
      save();
    }
    return {
      ok: true,
      conversation: conversationView(conversation, userId),
      messagesUnread: unreadConversationCount(userId),
    };
  }

  function archive(id, userId, archived = true) {
    const conversation = findConversation(id, userId);
    if (!conversation) return null;
    const archivedBy = new Set(conversation.archivedBy || []);
    if (archived) archivedBy.add(userId);
    else archivedBy.delete(userId);
    conversation.archivedBy = [...archivedBy];
    save();
    return {
      ok: true,
      conversation: conversationView(conversation, userId),
    };
  }

  function pin(id, userId, pinned = true) {
    const conversation = findConversation(id, userId);
    if (!conversation) return null;
    const pinnedBy = new Set(conversation.pinnedBy || []);
    if (pinned) pinnedBy.add(userId);
    else pinnedBy.delete(userId);
    conversation.pinnedBy = [...pinnedBy];
    save();
    return {
      ok: true,
      conversation: conversationView(conversation, userId),
    };
  }

  async function block(id, user, blocked = true) {
    const conversation = findConversation(id, user.id);
    if (!conversation) return { notFound: true };
    const otherId = conversation.participantIds.find((participantId) => participantId !== user.id);
    if (!otherId) return { invalidParticipant: true };

    const ids = blockedUserIds(user);
    if (blocked) ids.add(otherId);
    else ids.delete(otherId);
    user.blockedUserIds = [...ids];
    conversation.blockedBy = blocked
      ? [...new Set([...(conversation.blockedBy || []), user.id])]
      : (conversation.blockedBy || []).filter((participantId) => participantId !== user.id);
    await audit(
      user.id,
      blocked ? 'conversation.block' : 'conversation.unblock',
      'conversation',
      conversation.id,
      { otherId },
    );
    save();
    return {
      ok: true,
      blocked,
      conversation: conversationView(conversation, user.id),
    };
  }

  function listBlocked(user) {
    return {
      users: [...blockedUserIds(user)]
        .map((id) => publicUser(findUser(id)))
        .filter(Boolean),
    };
  }

  async function unblock(user, otherId) {
    const ids = blockedUserIds(user);
    if (!ids.has(otherId)) return false;
    ids.delete(otherId);
    user.blockedUserIds = [...ids];
    for (const conversation of db.conversations) {
      if (
        conversation.participantIds?.includes(user.id)
        && conversation.participantIds?.includes(otherId)
      ) {
        conversation.blockedBy = (conversation.blockedBy || [])
          .filter((id) => id !== user.id);
      }
    }
    await audit(user.id, 'user.unblock', 'user', otherId, {});
    save();
    return true;
  }

  async function remove(id, userId) {
    const conversation = findConversation(id, userId);
    if (!conversation) return false;
    conversation.deletedBy = [...new Set([
      ...(conversation.deletedBy || []),
      userId,
    ])];
    await audit(userId, 'conversation.delete', 'conversation', conversation.id, {
      subjectUserId: userId,
      scope: 'inbox_only',
      retainedForAdmin: true,
      participantIds: conversation.participantIds,
      messageCount: db.messages.filter((message) =>
        message.conversationId === conversation.id
      ).length,
    });
    save();
    return true;
  }

  return {
    archive,
    block,
    detail,
    list,
    listBlocked,
    markRead,
    markUnread,
    messages,
    pin,
    remove,
    typing,
    unblock,
  };
}
