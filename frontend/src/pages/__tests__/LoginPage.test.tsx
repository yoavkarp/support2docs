import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../LoginPage'

vi.mock('@/lib/firebase', () => ({ auth: {} }))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockSignIn = vi.fn()
const mockSignInWithPopup = vi.fn()
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignIn(...args),
  signInWithPopup: (...args: unknown[]) => mockSignInWithPopup(...args),
  GoogleAuthProvider: class {},
}))

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets document.title to "Login | Support2Docs"', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(document.title).toBe('Login | Support2Docs')
  })

  it('renders email and password inputs', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('email input has autocomplete="email"', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'email')
  })

  it('password input has autocomplete="current-password"', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('shows error message on failed email login', async () => {
    mockSignIn.mockRejectedValue(new Error('auth/wrong-password'))
    render(<MemoryRouter><LoginPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password.')).toBeInTheDocument()
    })
  })

  it('error message has role="alert" for screen readers', async () => {
    mockSignIn.mockRejectedValue(new Error('auth/wrong-password'))
    render(<MemoryRouter><LoginPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('navigates to /dashboard on successful email login', async () => {
    mockSignIn.mockResolvedValue({ user: { uid: '123' } })
    render(<MemoryRouter><LoginPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('shows error message on failed Google login', async () => {
    mockSignInWithPopup.mockRejectedValue(new Error('popup-closed'))
    render(<MemoryRouter><LoginPage /></MemoryRouter>)

    fireEvent.click(screen.getByText('Continue with Google'))

    await waitFor(() => {
      expect(screen.getByText('Google sign-in failed.')).toBeInTheDocument()
    })
  })
})
