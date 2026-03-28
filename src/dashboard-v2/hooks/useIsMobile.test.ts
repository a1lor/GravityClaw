import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from './useIsMobile'

describe('useIsMobile', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true })
  })

  it('returns false when window.innerWidth > 640', () => {
    const { result, unmount } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    unmount()
  })

  it('returns true when window.innerWidth <= 640', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true, configurable: true })
    const { result, unmount } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
    unmount()
  })

  it('returns true when window.innerWidth === 640 (boundary)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 640, writable: true, configurable: true })
    const { result, unmount } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
    unmount()
  })

  it('updates when window is resized below threshold', () => {
    const { result, unmount } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true, configurable: true })
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(true)
    unmount()
  })

  it('updates when window is resized above threshold', () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true, configurable: true })
    const { result, unmount } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 1280, writable: true, configurable: true })
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(false)
    unmount()
  })
})
