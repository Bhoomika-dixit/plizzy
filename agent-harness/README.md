# Plizzy agent harness

Server-only AI integration code lives here. It owns model prompting, Anthropic requests, GameDefinition parsing, validation, and bounded repair. Next.js routes in `app/api` authenticate requests and persist accepted output; client components never import this folder.
