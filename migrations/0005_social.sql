-- Social posts planned and sent from the portal (Social app): a caption, hashtags and pictures for one or more
-- networks, kept as a draft, scheduled for a time, or sent through the owner's webhook (Zapier, Make, n8n ...).
create table social_posts (
  id            text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  title         text not null default '',
  caption       text not null default '',
  hashtags      text not null default '[]' check (json_valid(hashtags)),
  media         text not null default '[]' check (json_valid(media)),
  platforms     text not null default '[]' check (json_valid(platforms)),
  status        text not null default 'draft' check (status in ('draft','scheduled','sending','posted','failed')),
  scheduled_at  text,
  sent_at       text,
  results       text not null default '{}' check (json_valid(results)),
  created_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;
create index social_posts_status on social_posts (status, scheduled_at);

-- Hashtag sets the owner saves and adds to a post in one click.
create table social_hashtag_sets (
  id          text primary key default (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',1+(abs(random())%4),1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
  name        text not null unique check (length(name) between 1 and 40),
  tags        text not null default '[]' check (json_valid(tags)),
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at  text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) strict;
