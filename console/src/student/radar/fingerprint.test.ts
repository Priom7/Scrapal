import { describe, expect, it } from 'vitest'
import { fingerprint, isEmpty } from './fingerprint'

const EXAMPLE = 'Graph neural networks for detecting financial fraud in transaction networks.'

describe('fingerprint', () => {
  it('names the method, the topic and the application separately', () => {
    const print = fingerprint(EXAMPLE)
    expect(print.methods.map((term) => term.label)).toContain('graph neural networks')
    expect(print.topics.map((term) => term.label)).toContain('network science')
    expect(print.applications.map((term) => term.label)).toContain('financial fraud detection')
  })

  it('files the work under the discipline most of its terms point at', () => {
    // One passing mention of healthcare must not outweigh a paper that is about
    // graphs throughout.
    const print = fingerprint(
      'We use graph neural networks and deep learning on transaction networks. '
      + 'One application could be clinical data.',
    )
    expect(print.discipline).toBe('Computer Science')
  })

  it('reads the career stage from how the writer describes the work', () => {
    expect(fingerprint('This PhD proposal sets out...').careerStage).toBe('phd-applicant')
    expect(fingerprint('In my MSc dissertation I examine...').careerStage).toBe('masters')
    expect(fingerprint(EXAMPLE).careerStage).toBe('unknown')
  })

  it('weighs a term that carries the paper above one mentioned once', () => {
    const print = fingerprint(
      'Graph neural networks are central. We extend graph neural networks and compare '
      + 'graph neural networks with baselines. Robotics is mentioned once.',
    )
    const gnn = print.methods.find((term) => term.label === 'graph neural networks')!
    const robotics = print.topics.find((term) => term.label === 'robotics')!
    expect(gnn.weight).toBeGreaterThan(robotics.weight)
  })

  it('keeps salient words that are not in the vocabulary, because novelty is the point', () => {
    const print = fingerprint(
      'We study cascading settlement failures in clearing houses. '
      + 'Cascading settlement risk in clearing houses is poorly understood.',
    )
    expect(print.keywords).toContain('clearing')
    expect(print.keywords).toContain('settlement')
  })

  it('reports nothing for text it cannot read, rather than inventing terms', () => {
    const print = fingerprint('asdf qwer zxcv')
    expect(print.topics).toHaveLength(0)
    expect(print.methods).toHaveLength(0)
    expect(isEmpty(print)).toBe(true)
  })

  it('is empty for empty input', () => {
    const print = fingerprint('   ')
    expect(print.words).toBe(0)
    expect(isEmpty(print)).toBe(true)
  })

  // The privacy guarantee, asserted rather than promised: this is the only
  // thing that leaves the device, so it must not carry the writing itself.
  it('never carries a sentence, a phrase or an unpublished detail out of the source', () => {
    const secret = 'Our unpublished trick is to reweight the adjacency matrix by settlement latency, '
      + 'which nobody else has tried, applied to graph neural networks for financial fraud.'
    const print = fingerprint(secret)
    const travelling = [
      ...print.keywords,
      ...print.topics.map((term) => term.label),
      ...print.methods.map((term) => term.label),
      ...print.applications.map((term) => term.label),
      print.discipline ?? '',
    ]
    for (const value of travelling) {
      // Nothing that travels may be long enough to be a phrase from the source.
      expect(value.split(/\s+/).length).toBeLessThanOrEqual(3)
      expect(secret).not.toContain(`${value} by`)
    }
    expect(travelling.join(' ')).not.toContain('nobody else has tried')
    expect(travelling.join(' ')).not.toContain('reweight the adjacency')
  })

  it('counts the words it had to work with', () => {
    expect(fingerprint('one two three').words).toBe(3)
  })
})
