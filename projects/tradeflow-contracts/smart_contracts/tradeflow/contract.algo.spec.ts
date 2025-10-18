import { Uint64, op } from '@algorandfoundation/algorand-typescript'
import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { Address, UintN64 } from '@algorandfoundation/algorand-typescript/arc4'
import { beforeEach, describe, expect, it } from 'vitest'
import { Tradeflow } from './contract.algo'

describe('Tradeflow contract - Unit Tests', () => {
  const ctx = new TestExecutionContext()

  beforeEach(() => {
    ctx.reset()
  })

  it('Creates an invoice with correct initial state', () => {
    const contract = ctx.contract.create(Tradeflow)
    const seller = ctx.any.account()
    const buyer = ctx.any.account()

    let invoiceId: UintN64 | undefined

    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      invoiceId = contract.createInvoice(
        new Address(buyer),
        new UintN64(100_000_000),
        new UintN64(1_000_000),
        new UintN64(1735689600),
      )
    })

    expect(invoiceId!.native).toEqual(Uint64(0))
    expect(contract.nextInvoiceId.value).toEqual(Uint64(1))

    let info: [Address, Address, UintN64, UintN64, UintN64] | undefined
    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      info = contract.getInvoiceInfo(invoiceId!)
    })

    expect(info![0].native).toEqual(seller)
    expect(info![1].native).toEqual(buyer)
    expect(info![2].native).toEqual(Uint64(100_000_000))
    expect(info![3].native).toEqual(Uint64(0))
    expect(info![4].native).toEqual(Uint64(0)) // PENDING
  })

  it('Allows buyer to approve invoice', () => {
    const contract = ctx.contract.create(Tradeflow)
    const seller = ctx.any.account()
    const buyer = ctx.any.account()

    let invoiceId: UintN64 | undefined

    // Create invoice as seller
    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      invoiceId = contract.createInvoice(
        new Address(buyer),
        new UintN64(100_000_000),
        new UintN64(1_000_000),
        new UintN64(1735689600),
      )
    })

    // Approve as buyer
    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: buyer })]).execute(() => {
      contract.approveInvoice(invoiceId!)
    })

    // Verify status changed to ACTIVE
    let info: [Address, Address, UintN64, UintN64, UintN64] | undefined
    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      info = contract.getInvoiceInfo(invoiceId!)
    })

    expect(info![4].native).toEqual(Uint64(1)) // ACTIVE
  })

  it('Prevents non-buyer from approving invoice', () => {
    const contract = ctx.contract.create(Tradeflow)
    const seller = ctx.any.account()
    const buyer = ctx.any.account()
    const other = ctx.any.account()

    let invoiceId: UintN64 | undefined

    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      invoiceId = contract.createInvoice(
        new Address(buyer),
        new UintN64(100_000_000),
        new UintN64(1_000_000),
        new UintN64(1735689600),
      )
    })

    // Try to approve as someone else
    expect(() => {
      ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: other })]).execute(() => {
        contract.approveInvoice(invoiceId!)
      })
    }).toThrow('Only buyer can approve')
  })

  it('Allows multiple invoices to be created', () => {
    const contract = ctx.contract.create(Tradeflow)
    const seller = ctx.any.account()
    const buyer1 = ctx.any.account()
    const buyer2 = ctx.any.account()

    let id1: UintN64 | undefined
    let id2: UintN64 | undefined

    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      id1 = contract.createInvoice(
        new Address(buyer1),
        new UintN64(50_000_000),
        new UintN64(1_000_000),
        new UintN64(1735689600),
      )
      id2 = contract.createInvoice(
        new Address(buyer2),
        new UintN64(75_000_000),
        new UintN64(2_000_000),
        new UintN64(1735689600),
      )
    })

    expect(id1!.native).toEqual(Uint64(0))
    expect(id2!.native).toEqual(Uint64(1))

    let info1: [Address, Address, UintN64, UintN64, UintN64] | undefined
    let info2: [Address, Address, UintN64, UintN64, UintN64] | undefined

    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      info1 = contract.getInvoiceInfo(id1!)
      info2 = contract.getInvoiceInfo(id2!)
    })

    expect(info1![1].native).toEqual(buyer1)
    expect(info2![1].native).toEqual(buyer2)
    expect(info2![2].native).toEqual(Uint64(75_000_000))
  })

  it('Tracks investor investment correctly', () => {
    const contract = ctx.contract.create(Tradeflow)
    const seller = ctx.any.account()
    const buyer = ctx.any.account()
    const investor1 = ctx.any.account()
    const investor2 = ctx.any.account()

    let invoiceId: UintN64 | undefined

    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      invoiceId = contract.createInvoice(
        new Address(buyer),
        new UintN64(100_000_000),
        new UintN64(1_000_000),
        new UintN64(1735689600),
      )
    })

    // Simulate investments (would be done via investInInvoice in real scenario)
    const id = invoiceId!.native
    const key1 = op.concat(op.itob(id), investor1.bytes)
    const key2 = op.concat(op.itob(id), investor2.bytes)

    contract.investments(key1).value = Uint64(30_000_000)
    contract.investments(key2).value = Uint64(20_000_000)

    // Check investments
    let inv1: UintN64 | undefined
    let inv2: UintN64 | undefined

    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      inv1 = contract.getInvestment(invoiceId!, new Address(investor1))
      inv2 = contract.getInvestment(invoiceId!, new Address(investor2))
    })

    expect(inv1!.native).toEqual(Uint64(30_000_000))
    expect(inv2!.native).toEqual(Uint64(20_000_000))
  })

  it('Returns 0 for investor with no investment', () => {
    const contract = ctx.contract.create(Tradeflow)
    const seller = ctx.any.account()
    const buyer = ctx.any.account()
    const investor = ctx.any.account()

    let invoiceId: UintN64 | undefined

    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      invoiceId = contract.createInvoice(
        new Address(buyer),
        new UintN64(100_000_000),
        new UintN64(1_000_000),
        new UintN64(1735689600),
      )
    })

    let investment: UintN64 | undefined
    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      investment = contract.getInvestment(invoiceId!, new Address(investor))
    })

    expect(investment!.native).toEqual(Uint64(0))
  })

  it('Prevents approval of non-pending invoice', () => {
    const contract = ctx.contract.create(Tradeflow)
    const seller = ctx.any.account()
    const buyer = ctx.any.account()

    let invoiceId: UintN64 | undefined

    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: seller })]).execute(() => {
      invoiceId = contract.createInvoice(
        new Address(buyer),
        new UintN64(100_000_000),
        new UintN64(1_000_000),
        new UintN64(1735689600),
      )
    })

    ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: buyer })]).execute(() => {
      contract.approveInvoice(invoiceId!)
    })

    // Try to approve again
    expect(() => {
      ctx.txn.createScope([ctx.any.txn.applicationCall({ sender: buyer })]).execute(() => {
        contract.approveInvoice(invoiceId!)
      })
    }).toThrow('Invoice must be pending')
  })
})
