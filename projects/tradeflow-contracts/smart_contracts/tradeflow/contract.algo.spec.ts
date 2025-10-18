import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { describe, expect, it } from 'vitest'
import { Tradeflow } from './contract.algo'

describe('Tradeflow contract', () => {
  const ctx = new TestExecutionContext()
  it('Logs the returned value when sayHello is called', () => {
    const contract = ctx.contract.create(Tradeflow)

    const result = contract.hello('Sally')

    expect(result).toBe('Hello, Sally')
  })
})
