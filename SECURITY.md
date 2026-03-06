# Security

## API Key Handling

Your Anthropic API key is:
- Entered locally in your browser
- Never stored in localStorage, sessionStorage, or cookies
- Never sent to any server other than `api.anthropic.com`
- Never logged or persisted beyond your browser session
- Cleared when you close or refresh the tab

The `anthropic-dangerous-direct-browser-access: true` header is required for direct browser-to-API calls. This is an Anthropic-sanctioned header for browser clients. It does not reduce security — it explicitly opts in to the known CORS behaviour.

## Running Locally

This app must be served over `http://` or `https://`. Opening via `file://` will cause CORS failures.

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Reporting Issues

If you find a security issue, open a GitHub issue marked `[SECURITY]` or contact via [ijneb.dev](https://ijneb.dev).
