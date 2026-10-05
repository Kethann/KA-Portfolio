-- Short-lived exact-question answers may be learned from repeated chats only when an admin
-- positively rated an answer grounded in an enabled owner-written knowledge source.
create table assistant_learnings (
  question_key text primary key check (length(question_key) between 8 and 500),
  question text not null check (length(question) between 1 and 500),
  answer text not null check (length(answer) between 1 and 2000),
  source_titles text not null check (json_valid(source_titles)),
  expires_at text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;
create index assistant_learnings_expiry on assistant_learnings (expires_at);
