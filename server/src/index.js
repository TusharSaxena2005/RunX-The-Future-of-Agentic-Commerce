import 'dotenv/config';
import { app } from './app.js';
import { prisma } from './db.js';
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log('AI Commerce server running on http://localhost:' + port));
process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
