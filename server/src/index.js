import dotenv from 'dotenv';

// Always load the server environment file relative to this module. Relying on
// process.cwd() makes Gemini and payment credentials disappear when the API is
// launched from the monorepo root instead of the server workspace.
dotenv.config({ path: new URL('../.env', import.meta.url), quiet: true });

const { app } = await import('./app.js');
const { prisma } = await import('./db.js');
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log('AI Commerce server running on http://localhost:' + port));
process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
