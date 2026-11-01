import { afterEach, expect, it, vi } from 'vitest'
import { cacheOriginalImage, evictOriginalImages, originalImage, removeOriginalImage } from './originalImages'
afterEach(()=>vi.unstubAllGlobals())
it('keeps recently used originals within both file-count and byte budgets without mutating metadata',()=>{
  const rows=Array.from({length:26},(_,i)=>({sha256:`image-${i}`,bytes:1,used:i})),before=structuredClone(rows)
  expect(evictOriginalImages(rows)).toEqual(['image-1','image-0']);expect(rows).toEqual(before)
  const large=Array.from({length:9},(_,i)=>({sha256:`large-${i}`,bytes:12_000_000,used:i}))
  expect(evictOriginalImages(large)).toEqual(['large-0']);large[0]!.used=10;expect(evictOriginalImages(large)).toEqual(['large-1'])
})
it('treats missing, blocked and forbidden browser storage as optional rather than failing image work',async()=>{
  vi.stubGlobal('indexedDB',undefined);expect(await originalImage('a'.repeat(64))).toBeNull();expect(await cacheOriginalImage('a'.repeat(64),new Blob(['x']),10,10)).toBe(false);await expect(removeOriginalImage('a'.repeat(64))).resolves.toBeUndefined()
  vi.stubGlobal('indexedDB',{open(){throw new DOMException('Disabled','SecurityError')}});expect(await originalImage('a'.repeat(64))).toBeNull();expect(await cacheOriginalImage('a'.repeat(64),new Blob(['x']),10,10)).toBe(false)
})
