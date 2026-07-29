export const TRANSACTION_PARTICIPANTS_SQL = `array[
  nullif(tx.data->>'senderId', ''),
  nullif(tx.data->>'travelerId', ''),
  nullif(tx.data->>'recipientId', '')
]`;

export function transactionParticipantFilter(parameter = '$1') {
  return `${TRANSACTION_PARTICIPANTS_SQL} @> array[${parameter}]::text[]`;
}
