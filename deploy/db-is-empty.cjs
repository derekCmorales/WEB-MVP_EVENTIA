// Sale con 0 si la tabla User está vacía. Lo usa entrypoint-api.sh antes de sembrar.
const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [process.cwd()] }))

const prisma = new PrismaClient()

prisma.user
  .count()
  .then((count) => process.exit(count === 0 ? 0 : 1))
  .catch((error) => {
    console.error(error)
    process.exit(2)
  })
