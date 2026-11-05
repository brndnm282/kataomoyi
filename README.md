# Kataomoyi

Kataomoyi is a collaborative Kanban board built with Next.js, React, Tailwind
CSS, and Supabase. It supports task prioritization, drag-and-drop workflow
management, assignees, labels, due dates, comments, and task activity history.

## Challenge

Build a focused, collaborative task board experience. Tasks can be organized
across four workflow states:

- To Do
- In Progress
- In Review
- Done

The board supports drag-and-drop task movement, priorities, labels, due dates,
assignees, comments, and activity history.

## Development scripts

```bash
npm run dev      # Start the development server
npm run build    # Create a production build
npm run start    # Serve the production build
npm run lint     # Run Next.js lint checks
```

## Project structure

```text
src/
├── app/
│   ├── page.tsx       # Kanban board UI and interactions
│   ├── layout.tsx     # Root layout and metadata
│   └── globals.css    # Global styles and Tailwind layers
└── lib/
    ├── supabase.ts    # Supabase client
    └── utils.ts       # Shared utilities
```

## Tech stack

- [Next.js 14](https://nextjs.org/)
- [React 18](https://react.dev/)
- [Supabase](https://supabase.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [@hello-pangea/dnd](https://github.com/hello-pangea/dnd)
