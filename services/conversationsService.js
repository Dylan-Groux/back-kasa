const crypto = require('crypto');
const { getUser } = require('./usersService');

const MAX_CONTENT_LENGTH = 2000;

function notFoundError(message = 'Conversation not found') {
  const err = new Error(message);
  err.status = 404;
  return err;
}

function badRequestError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function normalizePair(userIdA, userIdB) {
  return userIdA < userIdB ? [userIdA, userIdB] : [userIdB, userIdA];
}

function mapUserBasic(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, picture: row.picture };
}

function otherParticipantId(conversation, userId) {
  return conversation.participant_one_id === userId ? conversation.participant_two_id : conversation.participant_one_id;
}

// Returns the conversation only if userId is one of its two participants.
// A missing conversation and a conversation the user isn't a member of are
// indistinguishable from the caller's side (both 404) to avoid leaking
// conversation IDs via an IDOR-style enumeration through the 403 vs 404 signal.
async function getConversationForMember(db, conversationId, userId) {
  const row = await db.getAsync('SELECT * FROM conversations WHERE id = ?', [conversationId]);
  if (!row || (row.participant_one_id !== userId && row.participant_two_id !== userId)) {
    throw notFoundError();
  }
  return row;
}

async function listConversationsForUser(db, userId) {
  const rows = await db.allAsync(
    `
    SELECT
      c.id,
      c.updated_at,
      CASE WHEN c.participant_one_id = ? THEN c.participant_two_id ELSE c.participant_one_id END AS other_id,
      ou.name AS other_name,
      ou.picture AS other_picture,
      lm.content AS last_message_content,
      lm.sender_id AS last_message_sender_id,
      lm.created_at AS last_message_created_at
    FROM conversations c
    JOIN users ou ON ou.id = (CASE WHEN c.participant_one_id = ? THEN c.participant_two_id ELSE c.participant_one_id END)
    LEFT JOIN messages lm ON lm.rowid = (
      SELECT rowid FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, rowid DESC LIMIT 1
    )
    WHERE c.participant_one_id = ? OR c.participant_two_id = ?
    ORDER BY c.updated_at DESC
    `,
    [userId, userId, userId, userId]
  );

  return rows.map((row) => ({
    id: row.id,
    other_participant: { id: row.other_id, name: row.other_name, picture: row.other_picture },
    last_message: row.last_message_created_at
      ? { content: row.last_message_content, created_at: row.last_message_created_at, sender_id: row.last_message_sender_id }
      : null,
    updated_at: row.updated_at,
  }));
}

async function findOrCreateConversation(db, authUserId, participantId) {
  const targetId = Number(participantId);
  if (!participantId || !Number.isInteger(targetId)) {
    throw badRequestError('participant_id is required');
  }
  if (targetId === authUserId) {
    throw badRequestError('cannot create a conversation with yourself');
  }

  const targetUser = await getUser(db, targetId);
  if (!targetUser) {
    throw badRequestError('participant not found');
  }

  const [participantOneId, participantTwoId] = normalizePair(authUserId, targetId);
  const existing = await db.getAsync(
    'SELECT * FROM conversations WHERE participant_one_id = ? AND participant_two_id = ?',
    [participantOneId, participantTwoId]
  );

  if (existing) {
    return {
      created: false,
      conversation: {
        id: existing.id,
        other_participant: mapUserBasic(targetUser),
        created_at: existing.created_at,
      },
    };
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO conversations(id, participant_one_id, participant_two_id, created_at, updated_at) VALUES (?,?,?,?,?)',
    [id, participantOneId, participantTwoId, now, now]
  );

  return {
    created: true,
    conversation: {
      id,
      other_participant: mapUserBasic(targetUser),
      created_at: now,
    },
  };
}

async function sendMessage(db, conversationId, senderId, content) {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  if (!trimmed) {
    throw badRequestError('content is required');
  }
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    throw badRequestError(`content must be at most ${MAX_CONTENT_LENGTH} characters`);
  }

  const conversation = await getConversationForMember(db, conversationId, senderId);
  const receiverId = otherParticipantId(conversation, senderId);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO messages(id, conversation_id, sender_id, receiver_id, content, created_at) VALUES (?,?,?,?,?,?)',
    [id, conversationId, senderId, receiverId, trimmed, now]
  );
  await db.runAsync('UPDATE conversations SET updated_at = ? WHERE id = ?', [now, conversationId]);

  const [sender, receiver] = await Promise.all([getUser(db, senderId), getUser(db, receiverId)]);

  return {
    id,
    conversation_id: conversationId,
    content: trimmed,
    sender: mapUserBasic(sender),
    receiver: mapUserBasic(receiver),
    created_at: now,
  };
}

async function listMessages(db, conversationId, userId) {
  await getConversationForMember(db, conversationId, userId);

  const rows = await db.allAsync(
    `
    SELECT
      m.id, m.content, m.created_at,
      s.id AS sender_id, s.name AS sender_name, s.picture AS sender_picture,
      r.id AS receiver_id, r.name AS receiver_name, r.picture AS receiver_picture
    FROM messages m
    JOIN users s ON s.id = m.sender_id
    JOIN users r ON r.id = m.receiver_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC, m.rowid ASC
    `,
    [conversationId]
  );

  const messages = rows.map((row) => ({
    id: row.id,
    content: row.content,
    sender: { id: row.sender_id, name: row.sender_name, picture: row.sender_picture },
    receiver: { id: row.receiver_id, name: row.receiver_name, picture: row.receiver_picture },
    created_at: row.created_at,
  }));

  return { conversation_id: conversationId, messages };
}

module.exports = {
  listConversationsForUser,
  findOrCreateConversation,
  sendMessage,
  listMessages,
};
