/*
  # In-app Messaging

  Simple internal messaging between staff members.

  Tables
  ------
  messages
    sender_id    FK → users
    recipient_id FK → users (null = broadcast to branch)
    branch_id    FK → branches (for scoping)
    subject      short subject line
    body         message body
    read_at      null = unread
    parent_id    FK → messages (for threading/replies)
*/

CREATE TABLE IF NOT EXISTS messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  recipient_id uuid          REFERENCES users(id)    ON DELETE CASCADE,
  branch_id    uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  subject      varchar(200) NOT NULL DEFAULT '',
  body         text NOT NULL,
  read_at      timestamptz,
  parent_id    uuid          REFERENCES messages(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_recipient ON messages(recipient_id);
CREATE INDEX idx_messages_sender    ON messages(sender_id);
CREATE INDEX idx_messages_branch    ON messages(branch_id);
CREATE INDEX idx_messages_parent    ON messages(parent_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read messages"
  ON messages FOR SELECT TO anon USING (true);
CREATE POLICY "anon can insert messages"
  ON messages FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon can update messages"
  ON messages FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon can delete messages"
  ON messages FOR DELETE TO anon USING (true);
