const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function upsertUser({ username, password, role, balance }) {
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.upsert({
    where: { username },
    update: {
      passwordHash,
      role,
      balance,
      status: 'active'
    },
    create: {
      username,
      passwordHash,
      role,
      balance,
      status: 'active'
    }
  });
}

async function main() {
  await upsertUser({
    username: 'admin',
    password: 'admin123456',
    role: 'admin',
    balance: 0
  });

  for (let index = 1; index <= 5; index += 1) {
    await upsertUser({
      username: `user${index}`,
      password: '123456',
      role: 'user',
      balance: 100
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
