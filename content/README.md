# Markdown workspace

Every record is a Markdown file with YAML frontmatter. The starter includes `room`, `work`, `page`, `decision`, `outcome`, and `note`; add any lowercase, hyphenated type for your own business without changing the server.

Required fields are `id`, `type`, `title`, `status`, `owner`, `created`, and `updated`. `sensitivity` and `tags` are useful optional fields. Directories are organizational: standard types use their matching plural folder and custom types use a folder named after the type.

Agents should use `search` and `fetch` for discovery, `create_record` when direct writes are enabled, and `validate_repository` after manual changes.
