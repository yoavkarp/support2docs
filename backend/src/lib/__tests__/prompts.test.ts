import { describe, it, expect } from 'vitest'
import { buildKbDraftPrompt } from '../prompts/kb-draft.js'

describe('buildKbDraftPrompt()', () => {
  it('includes all ticket subjects in the prompt', () => {
    const tickets = [
      { subject: 'Cannot reset password', transcript: 'Password link expired' },
      { subject: 'Login timeout', transcript: 'Session expires after 1 min' },
      { subject: 'Account locked out', transcript: 'Too many failed attempts' },
    ]
    const prompt = buildKbDraftPrompt(tickets)

    expect(prompt).toContain('Cannot reset password')
    expect(prompt).toContain('Login timeout')
    expect(prompt).toContain('Account locked out')
  })

  it('includes all ticket transcripts in the prompt', () => {
    const tickets = [
      { subject: 'Bug A', transcript: 'Transcript of bug A with unique text ALPHA' },
      { subject: 'Bug B', transcript: 'Transcript of bug B with unique text BETA' },
    ]
    const prompt = buildKbDraftPrompt(tickets)

    expect(prompt).toContain('Transcript of bug A with unique text ALPHA')
    expect(prompt).toContain('Transcript of bug B with unique text BETA')
  })

  it('contains KB-related instruction text', () => {
    const tickets = [{ subject: 'Test', transcript: 'Test transcript' }]
    const prompt = buildKbDraftPrompt(tickets)

    // Checks that the prompt instructs the LLM to produce a KB article
    expect(prompt.toLowerCase()).toMatch(/knowledge base/i)
  })

  it('includes numbered ticket sections', () => {
    const tickets = [
      { subject: 'First issue', transcript: 'desc 1' },
      { subject: 'Second issue', transcript: 'desc 2' },
    ]
    const prompt = buildKbDraftPrompt(tickets)

    expect(prompt).toContain('Ticket 1')
    expect(prompt).toContain('Ticket 2')
  })

  it('works with a single ticket', () => {
    const ticket = { subject: 'Sole ticket', transcript: 'Only one support case' }
    const prompt = buildKbDraftPrompt([ticket])

    expect(prompt).toContain('Sole ticket')
    expect(prompt).toContain('Only one support case')
    expect(prompt).toContain('Ticket 1')
  })

  it('instructs the model to output title on the first line', () => {
    const tickets = [{ subject: 'Any', transcript: 'Any transcript' }]
    const prompt = buildKbDraftPrompt(tickets)

    // The prompt must instruct the LLM to put title on first line (no markdown heading)
    expect(prompt).toMatch(/first line|title.*first|Respond with ONLY the title/i)
  })

  it('labels each ticket by its subject', () => {
    const tickets = [
      { subject: 'Subject Alpha', transcript: 'tx1' },
      { subject: 'Subject Beta', transcript: 'tx2' },
    ]
    const prompt = buildKbDraftPrompt(tickets)

    expect(prompt).toContain('Ticket 1: Subject Alpha')
    expect(prompt).toContain('Ticket 2: Subject Beta')
  })

  it('returns a non-empty string for an empty ticket array', () => {
    const prompt = buildKbDraftPrompt([])
    expect(typeof prompt).toBe('string')
    expect(prompt.length).toBeGreaterThan(0)
  })
})
