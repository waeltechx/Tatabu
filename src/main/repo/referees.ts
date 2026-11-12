import { newId, type Db } from '../db/open'
import type { Referee, RefereeInput } from '@shared/settings'

interface Row {
  id: string
  name: string
  affiliation: string
  relationship: string
  include_relationship: number
  email: string
  phone: string
  address: string
}

function toReferee(r: Row): Referee {
  return {
    id: r.id,
    name: r.name,
    affiliation: r.affiliation,
    relationship: r.relationship,
    includeRelationship: r.include_relationship === 1,
    email: r.email,
    phone: r.phone,
    address: r.address
  }
}

/** The default referee list, in the order it prints. */
export function listReferees(db: Db): Referee[] {
  return (db.prepare('SELECT * FROM referees ORDER BY sort, rowid').all() as unknown as Row[]).map(toReferee)
}

export function saveReferee(db: Db, input: RefereeInput): Referee {
  const clean = (s: string): string => s.trim()
  const values = {
    name: clean(input.name),
    affiliation: clean(input.affiliation),
    relationship: clean(input.relationship),
    include_relationship: input.includeRelationship ? 1 : 0,
    email: clean(input.email),
    phone: clean(input.phone),
    address: input.address.trim()
  }
  if (!values.name) throw new Error('REFEREE_NAME_EMPTY')

  if (input.id) {
    const res = db
      .prepare(
        `UPDATE referees SET name = $name, affiliation = $affiliation, relationship = $relationship,
           include_relationship = $include_relationship, email = $email, phone = $phone, address = $address
         WHERE id = $id`
      )
      .run({ ...values, id: input.id })
    if (res.changes === 0) throw new Error('NOT_FOUND')
    return toReferee({ id: input.id, ...values })
  }

  const id = newId('ref')
  const { next } = db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS next FROM referees').get() as { next: number }
  db.prepare(
    `INSERT INTO referees (id, name, affiliation, relationship, include_relationship, email, phone, address, sort)
     VALUES ($id, $name, $affiliation, $relationship, $include_relationship, $email, $phone, $address, $sort)`
  ).run({ ...values, id, sort: next })
  return toReferee({ id, ...values })
}

export function removeReferee(db: Db, id: string): void {
  db.prepare('DELETE FROM referees WHERE id = ?').run(id)
}

/** Moves a referee one place up (-1) or down (+1) in the printed order. */
export function moveReferee(db: Db, id: string, delta: -1 | 1): Referee[] {
  const list = listReferees(db)
  const from = list.findIndex((r) => r.id === id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= list.length) return list
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item!)
  const stmt = db.prepare('UPDATE referees SET sort = ? WHERE id = ?')
  list.forEach((r, i) => stmt.run(i, r.id))
  return list
}
