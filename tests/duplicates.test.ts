/** Port of the reference app's tests/test_duplicates.py (postings and companies are invented). */
import { describe, expect, it } from 'vitest'
import {
  computeContentHash,
  computeOverlapCoefficient,
  computeSignals,
  extractJobId,
  extractReferenceNumbers,
  findDuplicates,
  normalizeCompany,
  normalizeTitle,
  normalizeUrl,
  type DuplicateRow
} from '../src/main/duplicates'
import type { DuplicateMatch, Status } from '@shared/applications'

let seq = 0
/** A saved application, with signals computed as on create. */
function saved(p: {
  company: string
  jobTitle: string
  jobDescription: string
  link?: string
  location?: string
  deadline?: string
  status?: Status
  rawText?: string
}): DuplicateRow {
  const s = computeSignals(p.link ?? '', p.jobDescription, p.rawText ?? '')
  return {
    id: `app_${++seq}`,
    company: p.company,
    jobTitle: p.jobTitle,
    location: p.location ?? '',
    deadline: p.deadline ?? '',
    status: p.status ?? 'saved',
    dateAdded: '2026-11-01T10:00:00.000Z',
    applicationLink: p.link ?? '',
    jobDescription: p.jobDescription,
    normalizedUrl: s.normalizedUrl,
    jobId: s.jobId,
    contentHash: s.contentHash,
    rawText: s.rawText,
    refNumbers: s.refNumbers
  }
}

const codes = (m: DuplicateMatch): string[] => m.reasons.map((r) => r.code)

describe('links and job ids', () => {
  it('normalises URLs and reads job-board ids', () => {
    const u1 = 'https://www.example.com/jobs/dev-101/?utm_source=linkedin&utm_medium=cpc#details'
    const u2 = 'http://example.com/jobs/dev-101'
    expect(normalizeUrl(u1)).toBe('example.com/jobs/dev-101')
    expect(normalizeUrl(u2)).toBe('example.com/jobs/dev-101')

    expect(extractJobId('https://www.linkedin.com/jobs/view/4012345678/?trk=feed')).toBe('linkedin:4012345678')
    expect(extractJobId('https://linkedin.com/jobs/search/?currentJobId=4012345678&refId=abc')).toBe('linkedin:4012345678')
    expect(extractJobId('https://de.indeed.com/viewjob?jk=abc987654321&utm_campaign=daily')).toBe('indeed:abc987654321')
    expect(extractJobId('https://www.stepstone.de/stellenangebote--Platform-Engineer--998877-inline.html')).toBe(
      'stepstone:998877'
    )
    expect(extractJobId('https://boards.greenhouse.io/acme/jobs/4455667')).toBe('greenhouse:4455667')
  })

  it('keeps meaningful query parameters, sorted', () => {
    expect(normalizeUrl('https://jobs.example.org/view?b=2&a=1&utm_campaign=x')).toBe('jobs.example.org/view?a=1&b=2')
    expect(normalizeUrl('')).toBe('')
  })
})

describe('scenarios a–e from the reference', () => {
  const origUrl = 'https://careers.techcorp.example/positions/ai-researcher-2026'
  const body = `
    About Us:
    TechCorp is a leading international AI technology company pioneering the future of foundation models.
    Our team consists of passionate researchers and engineers who push the boundaries of machine learning.
    We believe in open science, rapid empirical experimentation, and robust, reliable engineering.

    Responsibilities:
    - Train and fine-tune large language models and vision-language foundation models
    - Evaluate benchmarks and develop novel architectures for multi-step reasoning
    - Collaborate with software engineers on production deployment and scaling
    - Write high quality documentation and test suites for training pipelines
    - Participate in code reviews, technical designs, and research sprint planning

    Requirements:
    - Master or PhD in Computer Science, Machine Learning, or related field
    - Strong Python and PyTorch programming skills with GPU optimization experience
    - Proven research publications in top AI venues such as NeurIPS, ICML, ICLR, or CVPR
    - Familiarity with distributed training frameworks like DeepSpeed or Megatron-LM
    - Excellent communication skills in English and collaborative mindset

    Benefits:
    - Competitive salary with equity packages and annual performance bonus
    - 30 days paid vacation and flexible hybrid work environment
    - Modern workstation with high end GPU access and cloud compute budget
    `
  const origText = 'We are seeking an AI Research Scientist to join our Deep Learning team in Berlin.\n' + body
  const rows = [
    saved({
      company: 'TechCorp AI',
      jobTitle: 'AI Research Scientist',
      jobDescription: origText,
      link: origUrl,
      status: 'applied'
    })
  ]
  const id = rows[0]!.id

  it('(a) same URL', () => {
    const m = findDuplicates({ link: origUrl }, rows)
    expect(m).toHaveLength(1)
    expect(m[0]!.id).toBe(id)
    expect(codes(m[0]!)).toContain('link')
    expect(m[0]!.status).toBe('applied')
  })

  it('(b) same URL with tracking parameters and a trailing slash', () => {
    const m = findDuplicates({ link: `${origUrl}/?utm_source=newsletter&utm_medium=email` }, rows)
    expect(m).toHaveLength(1)
    expect(codes(m[0]!)).toContain('link')
  })

  it('(c) same description, different whitespace and first line', () => {
    const changed =
      '    Join our team: TechCorp is actively hiring an outstanding AI Researcher in Berlin!    \n\n' +
      body.replaceAll('\n    - ', '\n    * ')
    const m = findDuplicates({ link: 'https://different-job-board.example/post/999', text: changed }, rows)
    expect(m).toHaveLength(1)
    expect(codes(m[0]!)).toContain('contained')
    expect(m[0]!.similarity).toBeGreaterThanOrEqual(0.9)
  })

  it('(d) different URL, same description', () => {
    const m = findDuplicates({ link: 'https://another-site.example/view/777', text: origText }, rows)
    expect(m).toHaveLength(1)
    expect(codes(m[0]!)).toContain('identical')
  })

  it('(e) a different job does not match', () => {
    const different = `
    Junior Accountant wanted for mid-sized logistics firm in Hamburg.
    You will prepare balance sheets, process travel expense reports, and reconcile accounts.
    Requirements: Completed commercial apprenticeship (Finanzbuchhalter), DATEV knowledge, English B2.
    `
    const m = findDuplicates(
      {
        link: 'https://hamburg-logistics.example/jobs/accountant',
        text: different,
        company: 'Logistics North GmbH',
        jobTitle: 'Junior Accountant'
      },
      rows
    )
    expect(m).toHaveLength(0)
  })
})

describe('structured checks (after extraction)', () => {
  const rows = [
    saved({
      company: 'Nordwerk AG',
      jobTitle: 'Software Architect (m/f/d)',
      location: 'Munich',
      jobDescription: 'We are looking for a Software Architect to design cloud solutions.',
      link: 'https://jobs.nordwerk.example/roles/12345?ref=linkedin',
      status: 'interview'
    })
  ]

  it('matches the same link with different tracking', () => {
    const m = findDuplicates({ link: 'https://jobs.nordwerk.example/roles/12345?utm_source=rss' }, rows)
    expect(m).toHaveLength(1)
    expect(m[0]!.status).toBe('interview')
    expect(codes(m[0]!)).toContain('link')
  })

  it('matches company + title without the legal suffix or gender tag', () => {
    const m = findDuplicates({ company: 'Nordwerk', jobTitle: 'Software Architect' }, rows)
    expect(m).toHaveLength(1)
    expect(codes(m[0]!)).toContain('companyTitle')
    expect(normalizeCompany('Müller & Söhne GmbH & Co. KG')).toBe('mueller soehne')
    expect(normalizeTitle('Entwickler (m/w/d)')).toBe('entwickler')
  })
})

describe('reference numbers', () => {
  it('reads English and German reference numbers', () => {
    const refs1 = extractReferenceNumbers(
      'Job ID: R-102938 | Apply by 31.12.2026. Please cite Kennziffer 2026-CS-042 in your letter.'
    )
    expect(refs1).toContain('r-102938')
    expect(refs1).toContain('2026-cs-042')

    const refs2 = extractReferenceNumbers('Referenznummer: REF_889912. Stellen-ID: 77654. Aktenzeichen AZ-443.')
    expect(refs2).toContain('889912')
    expect(refs2).toContain('77654')
    expect(refs2).toContain('az-443')

    expect(extractReferenceNumbers('We are seeking a candidate for this position and online application.')).toHaveLength(0)
  })

  it('matches the same job through its Kennziffer even with different wording', () => {
    const rows = [
      saved({
        company: 'Example University Munich',
        jobTitle: 'Postdoc Quantum Computing',
        jobDescription:
          'Research Associate (Postdoc) in Quantum Computing.\nReference Number: Kennziffer QC-2026-99.\nSalary TV-L E13, 100% position. University of Munich.',
        link: 'https://uni.example/stellen/qc-2026-99'
      })
    ]
    const text =
      'Academic opening: Postdoctoral researcher.\nPlease quote Kennziffer QC-2026-99 in all correspondence.\nSend your application before November 15.'
    const m = findDuplicates({ text }, rows)
    expect(m.length).toBeGreaterThanOrEqual(1)
    expect(m[0]!.reasons.some((r) => r.code === 'refNumber' && r.value?.includes('qc-2026-99'))).toBe(true)
    expect(m[0]!.confidence).toBe('same_job')
  })
})

describe('noisy pasted pages', () => {
  it('finds a clean description inside a page full of menus and footers', () => {
    const clean = `
    About the Role:
    Design robust APIs and microservices in Python.
    Manage PostgreSQL database schemas and migrations.
    Work with Docker and Kubernetes clusters in AWS.
    Qualifications:
    At least 3 years backend experience.
    Proficiency with FastAPI or Django.
    `
    const noisy = `
    Home > Careers > Engineering > Backend Developer
    [Accept All Cookies] [Privacy Policy] [Cookie Settings]
    Language: EN | DE | FR
    Search Careers...
    ====================
    ${clean}
    ====================
    Share on LinkedIn | Tweet this job | Send by Email
    Copyright 2026 Tech Inc. Alle Rechte vorbehalten.
    Terms of Service | Legal Notice | Impressum | Contact Support
    `
    expect(computeOverlapCoefficient(noisy, clean)).toBeGreaterThanOrEqual(0.85)
  })

  it('flags a noisy re-paste before any AI call', () => {
    const desc =
      'We are looking for a Senior Computer Vision Engineer to work on 3D reconstruction and NeRF. ' +
      'Required skills: Python, PyTorch, C++, CUDA, OpenCV. ' +
      'You will develop realtime camera pose estimation and multi-view stereo algorithms. ' +
      'Benefits: 30 days vacation, remote work, equipment stipend.'
    const rows = [
      saved({
        company: 'DeepSight GmbH',
        jobTitle: 'Senior Computer Vision Engineer',
        location: 'Berlin',
        jobDescription: desc,
        link: 'https://deepsight.example/jobs/cv-senior-1',
        status: 'applied'
      })
    ]
    const noisy =
      'DeepSight - AI for the Physical World\n' +
      'Menu: Products | Solutions | Research | About Us | Careers | Sign In\n' +
      'We use cookies to improve user experience. Accept All Cookies | Reject\n' +
      'OPEN POSITION: Senior Computer Vision Engineer (m/w/d)\n' +
      desc +
      '\nApply Now | Share this opportunity on WhatsApp\n' +
      'DeepSight GmbH, Friedrichstraße 100, 10117 Berlin\n' +
      'Privacy Policy | Imprint | All rights reserved © 2026\n'
    const m = findDuplicates({ text: noisy }, rows)
    expect(m.length).toBeGreaterThanOrEqual(1)
    expect(m[0]!.company).toBe('DeepSight GmbH')
    expect(m[0]!.confidence).toBe('same_job')
    expect(codes(m[0]!).some((c) => c === 'contained' || c === 'identical')).toBe(true)
  })

  it('matches the same job posted on another site', () => {
    const desc =
      'Platform Engineer wanted at ScaleFlow. Manage multi-tenant Kubernetes on GCP. ' +
      'Terraform, Helm, Prometheus, Grafana, Go, Python. Excellent teamwork.'
    const rows = [
      saved({
        company: 'ScaleFlow Systems',
        jobTitle: 'Platform Engineer',
        jobDescription: desc,
        link: 'https://scaleflow.example/careers/platform-eng'
      })
    ]
    const m = findDuplicates(
      {
        link: 'https://www.stepstone.de/stellenangebote--Platform-Engineer-ScaleFlow--998877.html',
        text: `StepStone Job Board\n${desc}\nApply via StepStone Quick Apply`
      },
      rows
    )
    expect(m).toHaveLength(1)
    expect(m[0]!.confidence).toBe('same_job')
  })
})

describe('false positives', () => {
  it('does not call a different role at the same company the same job', () => {
    const rows = [
      saved({
        company: 'Brightline Group',
        jobTitle: 'Embedded Software Engineer',
        jobDescription: 'C/C++, AUTOSAR, microcontrollers, CAN bus, ISO 26262 functional safety.'
      })
    ]
    const m = findDuplicates(
      {
        link: 'https://brightline.example/careers/data-scientist-cloud',
        text: 'We need a Cloud Data Scientist for Predictive Maintenance with SQL, PySpark, Databricks.',
        company: 'Brightline Group',
        jobTitle: 'Cloud Data Scientist'
      },
      rows
    )
    for (const match of m) expect(match.confidence).not.toBe('same_job')
  })

  it('returns nothing without any usable input, and skips the excluded id', () => {
    const rows = [saved({ company: 'A', jobTitle: 'B', jobDescription: 'text text text', link: 'https://a.example/1' })]
    expect(findDuplicates({}, rows)).toEqual([])
    expect(findDuplicates({ link: 'https://a.example/1', excludeId: rows[0]!.id }, rows)).toEqual([])
  })
})

describe('Arabic postings', () => {
  it('keeps Arabic words when normalising and matches a re-paste', () => {
    const desc = 'نبحث عن مهندس برمجيات للعمل في فريق تطوير التطبيقات في الرياض مع خبرة في بايثون وقواعد البيانات'
    const rows = [saved({ company: 'شركة المثال', jobTitle: 'مهندس برمجيات', jobDescription: desc })]
    expect(computeContentHash(desc)).not.toBe('')
    const m = findDuplicates({ text: `القائمة الرئيسية\n${desc}\nجميع الحقوق محفوظة` }, rows)
    expect(m[0]?.confidence).toBe('same_job')
  })
})
