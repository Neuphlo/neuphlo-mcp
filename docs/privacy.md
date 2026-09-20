# Identifier privacy

The public MCP contract distinguishes stable knowledge-record IDs from private operational identifiers.

Stable record IDs such as `sales-work-0042` are returned because agents need them for `search`, `fetch`, citations, and links. The server does not return upstream user IDs, account IDs, provider object IDs, external references, source URLs, filesystem paths, owners, or arbitrary private frontmatter.

## Public metadata allowlist

Only these frontmatter fields can cross the MCP boundary:

- `id`
- `type`
- `area`
- `title`
- `status`
- `created`
- `updated`
- `sensitivity`
- `tags`

Tools and resources render Markdown from this allowlist instead of returning the source file verbatim. Adding `user_id`, `account_id`, `external_customer_id`, `owner`, or another field to a file does not make it public.

## External event references

`import_connector_events` uses the external ID only to deduplicate retries. The server:

1. combines the adapter identifier and external ID;
2. hashes the result with HMAC-SHA-256 and `MCP_REFERENCE_HASH_KEY`;
3. stores only the keyed hash;
4. omits source URLs; and
5. removes an exact external-ID occurrence from the imported summary.

Set a long independent secret before enabling imports:

```bash
openssl rand -hex 32
```

```dotenv
MCP_REFERENCE_HASH_KEY=<generated-secret>
```

Treat this key like a credential. Rotating it changes deduplication hashes; retain the previous content or migrate stored hashes deliberately.

## Text content boundary

The Markdown body is intentionally public to principals who can read its area. No system can reliably identify every possible identifier embedded in arbitrary prose. Adapters and writers must therefore submit an approved summary rather than raw source payloads, logs, URLs, or copied customer objects. The normalized ingestion boundary removes known structured identifiers; the adapter remains responsible for data minimization and redaction before submission.

This design prevents structured operational identifiers from leaking accidentally while keeping the knowledge itself usable.
