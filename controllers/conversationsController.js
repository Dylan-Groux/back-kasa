const {
  listConversationsForUser,
  findOrCreateConversation,
  sendMessage,
  listMessages,
} = require('../services/conversationsService');

function statusFromError(e) {
  if (e && e.status) return e.status;
  return 500;
}

async function list(req, res) {
  const db = req.app.locals.db;
  try {
    const conversations = await listConversationsForUser(db, req.user.id);
    res.json(conversations);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function findOrCreate(req, res) {
  const db = req.app.locals.db;
  try {
    const { participant_id } = req.body || {};
    const { created, conversation } = await findOrCreateConversation(db, req.user.id, participant_id);
    res.status(created ? 201 : 200).json(conversation);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function postMessage(req, res) {
  const db = req.app.locals.db;
  try {
    const { content } = req.body || {};
    const message = await sendMessage(db, req.params.conversationId, req.user.id, content);
    res.status(201).json(message);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

async function getMessages(req, res) {
  const db = req.app.locals.db;
  try {
    const result = await listMessages(db, req.params.conversationId, req.user.id);
    res.json(result);
  } catch (e) {
    res.status(statusFromError(e)).json({ error: e.message });
  }
}

module.exports = {
  list,
  findOrCreate,
  postMessage,
  getMessages,
};
