import { PrismaClient } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'

const prisma = new PrismaClient()

const sampleTickets = [
  {
    sourceId: 'zendesk-001',
    source: 'zendesk',
    subject: 'Cannot reset password',
    transcript: 'User: I cannot reset my password. The email never arrives.\nAgent: Please check your spam folder and ensure the email is correct.\nUser: Found it in spam, thanks!',
  },
  {
    sourceId: 'zendesk-002',
    source: 'zendesk',
    subject: 'Password reset email not received',
    transcript: 'User: Password reset not working.\nAgent: Check spam folder.\nUser: That worked, thank you.',
  },
  {
    sourceId: 'zendesk-003',
    source: 'zendesk',
    subject: 'How to export data',
    transcript: 'User: How do I export my data?\nAgent: Go to Settings > Export > Download CSV.\nUser: Perfect, got it.',
  },
]

async function main() {
  console.log('Seeding database...')
  for (const ticket of sampleTickets) {
    await prisma.ticket.upsert({
      where: { sourceId: ticket.sourceId },
      update: {},
      create: { id: uuidv4(), ...ticket },
    })
  }
  console.log('Seed complete.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
