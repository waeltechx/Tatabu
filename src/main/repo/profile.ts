import type { Db } from '../db/open'
import { safeImage } from '@shared/docs/common'
import { EMPTY_PROFILE, type Profile } from '@shared/profile'

interface Row {
  full_name: string
  headline: string
  phone: string
  email: string
  address: string
  links: string
  signature: string
}

function parseLinks(raw: string): string[] {
  try {
    const v = JSON.parse(raw) as unknown
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function getProfile(db: Db): Profile {
  const r = db.prepare('SELECT * FROM profile WHERE id = 1').get() as unknown as Row | undefined
  if (!r) return { ...EMPTY_PROFILE }
  return {
    fullName: r.full_name,
    headline: r.headline,
    phone: r.phone,
    email: r.email,
    address: r.address,
    links: parseLinks(r.links),
    signature: r.signature
  }
}

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.slice(0, max) : '')

export function saveProfile(db: Db, input: Partial<Profile>): Profile {
  const cur = getProfile(db)
  const next: Profile = {
    fullName: input.fullName !== undefined ? str(input.fullName, 200).trim() : cur.fullName,
    headline: input.headline !== undefined ? str(input.headline, 200).trim() : cur.headline,
    phone: input.phone !== undefined ? str(input.phone, 80).trim() : cur.phone,
    email: input.email !== undefined ? str(input.email, 200).trim() : cur.email,
    address: input.address !== undefined ? str(input.address, 500).trim() : cur.address,
    links:
      input.links !== undefined
        ? (Array.isArray(input.links) ? input.links : [])
            .map((l) => str(l, 300).trim())
            .filter(Boolean)
            .slice(0, 10)
        : cur.links,
    // Only a real PNG/JPEG data URL (from the signature pad) is kept; ~1 MB at most.
    signature: input.signature !== undefined ? safeImage(str(input.signature, 1_500_000)) : cur.signature
  }
  db.prepare(
    `UPDATE profile SET full_name = ?, headline = ?, phone = ?, email = ?, address = ?, links = ?, signature = ? WHERE id = 1`
  ).run(next.fullName, next.headline, next.phone, next.email, next.address, JSON.stringify(next.links), next.signature)
  return next
}
