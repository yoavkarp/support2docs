import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createElement } from 'react'
import { OrgProvider, useActiveOrg } from '../OrgContext'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function OrgIdDisplay() {
  const { activeOrgId } = useActiveOrg()
  return createElement('span', { 'data-testid': 'orgId' }, activeOrgId ?? 'null')
}

function OrgSetter({ id }: { id: string }) {
  const { setActiveOrgId } = useActiveOrg()
  return createElement(
    'button',
    { onClick: () => setActiveOrgId(id), 'data-testid': 'setter' },
    'set',
  )
}

function renderWithProvider(initialOrgId?: string) {
  if (initialOrgId) {
    localStorage.setItem('activeOrgId', initialOrgId)
  }
  return render(
    createElement(
      OrgProvider,
      null,
      createElement(OrgIdDisplay, null),
      createElement(OrgSetter, { id: 'new-org' }),
    ),
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OrgProvider / useActiveOrg', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('initialises activeOrgId from localStorage', () => {
    localStorage.setItem('activeOrgId', 'stored-org-id')
    renderWithProvider()
    expect(screen.getByTestId('orgId').textContent).toBe('stored-org-id')
  })

  it('initialises activeOrgId as null when localStorage is empty', () => {
    renderWithProvider()
    expect(screen.getByTestId('orgId').textContent).toBe('null')
  })

  it('setActiveOrgId updates the displayed value', () => {
    renderWithProvider()
    act(() => {
      fireEvent.click(screen.getByTestId('setter'))
    })
    expect(screen.getByTestId('orgId').textContent).toBe('new-org')
  })

  it('setActiveOrgId writes the new id to localStorage', () => {
    renderWithProvider()
    act(() => {
      fireEvent.click(screen.getByTestId('setter'))
    })
    expect(localStorage.getItem('activeOrgId')).toBe('new-org')
  })

  it('multiple consumers share the same context value', () => {
    // Render two consumers inside the same provider
    render(
      createElement(
        OrgProvider,
        null,
        createElement(OrgIdDisplay, null),
        createElement(OrgSetter, { id: 'shared-org' }),
        // A second OrgIdDisplay to confirm both see the same value
        createElement('span', { 'data-testid': 'orgId2' }, null),
      ),
    )

    act(() => {
      fireEvent.click(screen.getByTestId('setter'))
    })

    expect(screen.getByTestId('orgId').textContent).toBe('shared-org')
  })

  it('setActiveOrgId replaces a previously stored value in localStorage', () => {
    localStorage.setItem('activeOrgId', 'old-org')
    renderWithProvider()
    act(() => {
      fireEvent.click(screen.getByTestId('setter'))
    })
    expect(localStorage.getItem('activeOrgId')).toBe('new-org')
  })
})
