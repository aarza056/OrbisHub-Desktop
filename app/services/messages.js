(function () {
  if (!window) return;
  const db = window.DB;

  let MESSAGES_TABLE = null;
  let MESSAGES_SCHEMA = null;

  async function resolveMessagesTable() {
    if (MESSAGES_TABLE) return MESSAGES_TABLE;
    try {
      const any = await db.query(
        `SELECT TOP 1 s.name AS schemaName
         FROM sys.tables t
         JOIN sys.schemas s ON t.schema_id = s.schema_id
         WHERE t.name = 'Messages'
         ORDER BY CASE WHEN s.name='dbo' THEN 0 ELSE 1 END`,
        []
      );
      if (any.success && Array.isArray(any.data) && any.data.length > 0) {
        MESSAGES_SCHEMA = any.data[0].schemaName || 'dbo';
        MESSAGES_TABLE = `[${MESSAGES_SCHEMA}].Messages`;
        return MESSAGES_TABLE;
      }
    } catch {}
    return null;
  }

  async function ensure() {
    try {
      const tbl = await resolveMessagesTable();
      if (tbl) {
        try {
          const cols = await db.query(
            `SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH AS len
             FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_NAME = 'Messages' AND (@param0 IS NULL OR TABLE_SCHEMA = @param0)
               AND COLUMN_NAME IN ('SenderId','RecipientId')`,
            [{ value: MESSAGES_SCHEMA }]
          );
          if (cols.success && Array.isArray(cols.data)) {
            for (const c of cols.data) {
              const name = c.COLUMN_NAME || c.Column_name || c.column_name;
              const len = c.len || c.CHARACTER_MAXIMUM_LENGTH;
              if (name && (len === null || len < 128)) {
                await db.execute(
                  `ALTER TABLE ${tbl} ALTER COLUMN ${name} NVARCHAR(128) ${name === 'SenderId' ? 'NOT NULL' : 'NULL'}`,
                  []
                );
              }
            }
          }
        } catch {}
        return true;
      }
      const create = await db.execute(
        `IF NOT EXISTS (SELECT 1 FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id WHERE t.name='Messages' AND s.name='dbo')
         BEGIN
           CREATE TABLE [dbo].[Messages] (
            Id NVARCHAR(64) PRIMARY KEY,
            SenderId NVARCHAR(128) NOT NULL,
            RecipientId NVARCHAR(128) NULL,
            ChannelId NVARCHAR(50) NULL,
            Content NVARCHAR(MAX) NOT NULL,
            SentAt DATETIME DEFAULT GETDATE(),
            [Read] BIT DEFAULT 0,
            HasAttachment BIT DEFAULT 0,
            AttachmentName NVARCHAR(255) NULL,
            AttachmentSize INT NULL,
            AttachmentType NVARCHAR(100) NULL,
            AttachmentData VARBINARY(MAX) NULL
           )
         END`,
        []
      );
      if (create.success) {
        MESSAGES_SCHEMA = 'dbo';
        MESSAGES_TABLE = '[dbo].Messages';
      }
      return !!create.success;
    } catch (e) {
      console.error('Messages.ensure failed:', e);
      return false;
    }
  }

  async function send({ senderId, recipientId, content, hasAttachment, attachmentName, attachmentSize, attachmentType, attachmentData }) {
    await ensure();
    const sId = String(senderId || '').trim();
    const rId = recipientId != null ? String(recipientId).trim() : null;
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tbl = MESSAGES_TABLE || '[dbo].Messages';

    // Encrypt message content before storing
    const encryptResult = await window.electronAPI.encryptMessage(content);
    if (!encryptResult || !encryptResult.success) {
      return { success: false, error: 'Failed to encrypt message content' };
    }
    const encryptedContent = encryptResult.encrypted;

    let insert;
    if (hasAttachment && attachmentData) {
      insert = await db.execute(
        `INSERT INTO ${tbl} (Id, SenderId, RecipientId, Content, SentAt, [Read], HasAttachment, AttachmentName, AttachmentSize, AttachmentType, AttachmentData) 
         VALUES (@param0, @param1, @param2, @param3, GETDATE(), 0, @param4, @param5, @param6, @param7, @param8)`,
        [
          { value: msgId },
          { value: sId },
          { value: rId },
          { value: encryptedContent },
          { value: 1 },
          { value: attachmentName },
          { value: attachmentSize },
          { value: attachmentType },
          { value: attachmentData },
        ]
      );
    } else {
      insert = await db.execute(
        `INSERT INTO ${tbl} (Id, SenderId, RecipientId, Content, SentAt, [Read], HasAttachment) VALUES (@param0, @param1, @param2, @param3, GETDATE(), 0, 0)`,
        [
          { value: msgId },
          { value: sId },
          { value: rId },
          { value: encryptedContent },
        ]
      );
    }

    if (insert.success) {
      return { success: true, message: { Id: msgId, SenderId: sId, RecipientId: rId, Content: content, SentAt: new Date().toISOString(), Read: 0 } };
    }
    return { success: false, error: insert.error || 'Insert failed' };
  }

  async function unreadCount(userId) {
    await ensure();
    const tbl = MESSAGES_TABLE || '[dbo].Messages';
    const q = await db.query(
      `SELECT COUNT(*) AS cnt FROM ${tbl} WHERE LOWER(LTRIM(RTRIM(RecipientId))) = LOWER(LTRIM(RTRIM(@param0))) AND [Read] = 0`,
      [{ value: userId }]
    );
    return q.success && q.data && q.data[0] ? (q.data[0].cnt || 0) : 0;
  }

  async function list(currentUserId, otherUserId) {
    await ensure();
    const tbl = MESSAGES_TABLE || '[dbo].Messages';
    const curId = String(currentUserId).trim();
    const othId = otherUserId != null ? String(otherUserId).trim() : null;

    let messages = [];

    if (!othId || curId === othId) {
      let q = await db.query(
        `SELECT m.Id, m.SenderId, m.RecipientId, m.Content, m.SentAt, m.[Read],
                ISNULL(m.HasAttachment, 0) AS HasAttachment,
                m.AttachmentName,
                m.AttachmentSize,
                m.AttachmentType,
                u.name AS SenderName, u.username AS SenderUsername
         FROM ${tbl} m
         LEFT JOIN Users u ON LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(u.id)))
         WHERE LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(@param0)))
           AND (
                LOWER(LTRIM(RTRIM(m.RecipientId))) = LOWER(LTRIM(RTRIM(@param0)))
             OR m.RecipientId IS NULL
             OR LTRIM(RTRIM(m.RecipientId)) = ''
           )
         ORDER BY m.SentAt ASC`,
        [{ value: curId }]
      );
      if (!(q.success && Array.isArray(q.data) && q.data.length > 0)) {
        const q2 = await db.query(
          `SELECT m.Id, m.SenderId, m.RecipientId, m.Content, m.SentAt, m.[Read],
                  ISNULL(m.HasAttachment, 0) AS HasAttachment,
                  m.AttachmentName,
                  m.AttachmentSize,
                  m.AttachmentType,
                  u.name AS SenderName, u.username AS SenderUsername
           FROM ${tbl} m
           LEFT JOIN Users u ON LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(u.id)))
           WHERE LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(@param0)))
              OR LOWER(LTRIM(RTRIM(m.RecipientId))) = LOWER(LTRIM(RTRIM(@param0)))
           ORDER BY m.SentAt ASC`,
          [{ value: curId }]
        );
        if (q2.success) q = q2;
      }
      messages = q.success && Array.isArray(q.data) ? q.data : [];
    } else {
      let q = await db.query(
        `SELECT m.Id, m.SenderId, m.RecipientId, m.Content, m.SentAt, m.[Read],
                ISNULL(m.HasAttachment, 0) AS HasAttachment,
                m.AttachmentName,
                m.AttachmentSize,
                m.AttachmentType,
                u.name AS SenderName, u.username AS SenderUsername
         FROM ${tbl} m
         LEFT JOIN Users u ON m.SenderId = u.id
         WHERE (m.SenderId = @param0 AND m.RecipientId = @param1)
            OR (m.SenderId = @param1 AND m.RecipientId = @param0)
         ORDER BY m.SentAt ASC`,
        [{ value: curId }, { value: othId }]
      );

      if (!q.success || !q.data || q.data.length === 0) {
        q = await db.query(
          `SELECT m.Id, m.SenderId, m.RecipientId, m.Content, m.SentAt, m.[Read],
                  ISNULL(m.HasAttachment, 0) AS HasAttachment,
                  m.AttachmentName,
                  m.AttachmentSize,
                  m.AttachmentType,
                  u.name AS SenderName, u.username AS SenderUsername
           FROM ${tbl} m
           LEFT JOIN Users u ON LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(u.id)))
           WHERE (LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(@param0))) AND LOWER(LTRIM(RTRIM(m.RecipientId))) = LOWER(LTRIM(RTRIM(@param1))))
              OR (LOWER(LTRIM(RTRIM(m.SenderId))) = LOWER(LTRIM(RTRIM(@param1))) AND LOWER(LTRIM(RTRIM(m.RecipientId))) = LOWER(LTRIM(RTRIM(@param0))))
           ORDER BY m.SentAt ASC`,
          [{ value: curId }, { value: othId }]
        );
      }

      messages = q.success && Array.isArray(q.data) ? q.data : [];
    }

    // Decrypt message content
    for (let msg of messages) {
      if (msg.Content) {
        const decryptResult = await window.electronAPI.decryptMessage(msg.Content);
        if (decryptResult && decryptResult.success) {
          msg.Content = decryptResult.decrypted;
        }
      }
    }

    return messages;
  }

  async function markRead(userId, otherUserId) {
    await ensure();
    const tbl = MESSAGES_TABLE || '[dbo].Messages';
    const upd = await db.execute(
      `UPDATE ${tbl} SET [Read] = 1 WHERE LOWER(LTRIM(RTRIM(RecipientId))) = LOWER(LTRIM(RTRIM(@param0))) AND LOWER(LTRIM(RTRIM(SenderId))) = LOWER(LTRIM(RTRIM(@param1))) AND [Read] = 0`,
      [{ value: userId }, { value: otherUserId }]
    );
    return { success: !!upd.success, rowsAffected: upd.rowsAffected };
  }

  window.Messages = { ensure, send, list, unreadCount, markRead };
})();
