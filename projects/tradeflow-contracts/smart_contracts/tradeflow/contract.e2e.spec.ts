import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import type { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { TradeflowFactory } from '../artifacts/tradeflow/TradeflowClient'

describe('Tradeflow contract - E2E Tests', () => {
  const localnet = algorandFixture()

  beforeAll(() => {
    Config.configure({
      debug: true,
    })
    registerDebugEventHandlers()
  })

  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(TradeflowFactory, {
      defaultSender: account,
    })

    const { appClient } = await factory.deploy({
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })

    // Fund the app account for inner transactions
    await localnet.algorand.send.payment({
      sender: account,
      receiver: appClient.appAddress,
      amount: (1).algo(),
    })

    return { client: appClient }
  }

  test('Complete invoice lifecycle: create, approve, invest, buyer pays, investors claim', async () => {
    const { generateAccount } = localnet.context

    const deployerAccount = await generateAccount({ initialFunds: (600).algo() })
    const { client } = await deploy(deployerAccount.addr)

    // Create additional test accounts
    const seller = await localnet.algorand.account.random()
    const buyer = await localnet.algorand.account.random()
    const investor1 = await localnet.algorand.account.random()
    const investor2 = await localnet.algorand.account.random()

    // Fund accounts with enough for operations + payment
    await localnet.algorand.send.payment({
      sender: deployerAccount.addr,
      receiver: seller.addr,
      amount: (150).algo(),
    })
    await localnet.algorand.send.payment({
      sender: deployerAccount.addr,
      receiver: buyer.addr,
      amount: (150).algo(),
    })
    await localnet.algorand.send.payment({
      sender: deployerAccount.addr,
      receiver: investor1.addr,
      amount: (100).algo(),
    })
    await localnet.algorand.send.payment({
      sender: deployerAccount.addr,
      receiver: investor2.addr,
      amount: (100).algo(),
    })

    // Step 1: Seller creates invoice
    const createResult = await client.send.createInvoice({
      sender: seller.addr,
      args: {
        buyer: buyer.addr.toString(),
        totalAmount: 100_000_000n,
        minInvestment: 10_000_000n,
        dueDate: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
      },
    })

    const invoiceId = createResult.return!
    expect(invoiceId).toBe(0n)

    // Step 2: Buyer approves invoice
    await client.send.approveInvoice({
      sender: buyer.addr,
      args: { invoiceId },
    })

    // Verify invoice is now active
    const infoAfterApproval = await client.send.getInvoiceInfo({
      sender: deployerAccount.addr,
      args: { invoiceId },
    })
    expect(infoAfterApproval.return![4]).toBe(1n) // ACTIVE status

    // Step 3: Investor 1 invests 60 ALGO
    const investParams1 = await client.params.investInInvoice({
      args: {
        payment: await localnet.algorand.createTransaction.payment({
          sender: investor1.addr,
          receiver: seller.addr,
          amount: (60).algo(),
        }),
        invoiceId,
      },
      sender: investor1.addr,
    })

    await localnet.algorand.send.appCallMethodCall(investParams1)

    // Check investment recorded
    const investment1 = await client.send.getInvestment({
      sender: deployerAccount.addr,
      args: { invoiceId, investor: investor1.addr.toString() },
    })
    expect(investment1.return).toBe(60_000_000n)

    // Step 4: Investor 2 invests 40 ALGO (completes funding)
    const investParams2 = await client.params.investInInvoice({
      args: {
        payment: await localnet.algorand.createTransaction.payment({
          sender: investor2.addr,
          receiver: seller.addr,
          amount: (40).algo(),
        }),
        invoiceId,
      },
      sender: investor2.addr,
    })

    await localnet.algorand.send.appCallMethodCall(investParams2)

    // Check invoice is now fully funded
    const infoAfterFunding = await client.send.getInvoiceInfo({
      sender: deployerAccount.addr,
      args: { invoiceId },
    })
    expect(infoAfterFunding.return![3]).toBe(100_000_000n) // Amount raised
    expect(infoAfterFunding.return![4]).toBe(2n) // FUNDED status

    // Step 5: Buyer pays the invoice to the contract
    const payInvoiceParams = await client.params.payInvoice({
      args: {
        payment: await localnet.algorand.createTransaction.payment({
          sender: buyer.addr,
          receiver: client.appAddress,
          amount: (100).algo(),
        }),
        invoiceId,
      },
      sender: buyer.addr,
    })

    await localnet.algorand.send.appCallMethodCall(payInvoiceParams)

    // Verify invoice is marked as paid
    const infoAfterPayment = await client.send.getInvoiceInfo({
      sender: deployerAccount.addr,
      args: { invoiceId },
    })
    expect(infoAfterPayment.return![4]).toBe(3n) // PAID status

    // Step 6: Investors claim their payouts
    const investor1BalanceBefore = await localnet.algorand.account.getInformation(investor1.addr)
    const investor2BalanceBefore = await localnet.algorand.account.getInformation(investor2.addr)

    // Investor 1 claims their 60 ALGO
    await client.send.claimPayout({
      sender: investor1.addr,
      args: { invoiceId },
      staticFee: (2_000).microAlgo(),
    })

    // Investor 2 claims their 40 ALGO
    await client.send.claimPayout({
      sender: investor2.addr,
      args: { invoiceId },
      staticFee: (2_000).microAlgo(),
    })

    // Verify investors received their payouts
    const investor1BalanceAfter = await localnet.algorand.account.getInformation(investor1.addr)
    const investor2BalanceAfter = await localnet.algorand.account.getInformation(investor2.addr)

    const inv1Before = investor1BalanceBefore.balance.microAlgo
    const inv1After = investor1BalanceAfter.balance.microAlgo
    const inv2Before = investor2BalanceBefore.balance.microAlgo
    const inv2After = investor2BalanceAfter.balance.microAlgo

    expect(inv1After).toBeGreaterThan(inv1Before + 59_000_000n)
    expect(inv2After).toBeGreaterThan(inv2Before + 39_000_000n)

    // Verify investments are marked as claimed
    const investment1AfterClaim = await client.send.getInvestment({
      sender: deployerAccount.addr,
      args: { invoiceId, investor: investor1.addr.toString() },
    })
    const investment2AfterClaim = await client.send.getInvestment({
      sender: deployerAccount.addr,
      args: { invoiceId, investor: investor2.addr.toString() },
    })

    expect(investment1AfterClaim.return).toBe(0n)
    expect(investment2AfterClaim.return).toBe(0n)
  })

  test('Multiple investors can invest in same invoice', async () => {
    const { generateAccount } = localnet.context
    const deployerAccount = await generateAccount({ initialFunds: (600).algo() })
    const { client } = await deploy(deployerAccount.addr)

    const seller = await localnet.algorand.account.random()
    const buyer = await localnet.algorand.account.random()
    const investor1 = await localnet.algorand.account.random()
    const investor2 = await localnet.algorand.account.random()
    const investor3 = await localnet.algorand.account.random()

    // Fund accounts
    for (const account of [seller, buyer, investor1, investor2, investor3]) {
      await localnet.algorand.send.payment({
        sender: deployerAccount.addr,
        receiver: account.addr,
        amount: (100).algo(),
      })
    }

    // Create and approve invoice
    const createResult = await client.send.createInvoice({
      sender: seller.addr,
      args: {
        buyer: buyer.addr.toString(),
        totalAmount: 90_000_000n,
        minInvestment: 10_000_000n,
        dueDate: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
      },
    })
    const invoiceId = createResult.return!

    await client.send.approveInvoice({
      sender: buyer.addr,
      args: { invoiceId },
    })

    // Three investors invest different amounts
    for (const investor of [investor1, investor2, investor3]) {
      const investParams = await client.params.investInInvoice({
        args: {
          payment: await localnet.algorand.createTransaction.payment({
            sender: investor.addr,
            receiver: seller.addr,
            amount: (30).algo(),
          }),
          invoiceId,
        },
        sender: investor.addr,
      })

      await localnet.algorand.send.appCallMethodCall(investParams)
    }

    // Verify all investments
    const inv1 = await client.send.getInvestment({
      sender: deployerAccount.addr,
      args: { invoiceId, investor: investor1.addr.toString() },
    })
    const inv2 = await client.send.getInvestment({
      sender: deployerAccount.addr,
      args: { invoiceId, investor: investor2.addr.toString() },
    })
    const inv3 = await client.send.getInvestment({
      sender: deployerAccount.addr,
      args: { invoiceId, investor: investor3.addr.toString() },
    })

    expect(inv1.return).toBe(30_000_000n)
    expect(inv2.return).toBe(30_000_000n)
    expect(inv3.return).toBe(30_000_000n)

    // Check invoice is fully funded
    const info = await client.send.getInvoiceInfo({
      sender: deployerAccount.addr,
      args: { invoiceId },
    })
    expect(info.return![3]).toBe(90_000_000n)
    expect(info.return![4]).toBe(2n) // FUNDED
  })

  test('Prevents investment below minimum', async () => {
    const { generateAccount } = localnet.context
    const deployerAccount = await generateAccount({ initialFunds: (400).algo() })
    const { client } = await deploy(deployerAccount.addr)

    const seller = await localnet.algorand.account.random()
    const buyer = await localnet.algorand.account.random()
    const investor = await localnet.algorand.account.random()

    await localnet.algorand.send.payment({ sender: deployerAccount.addr, receiver: seller.addr, amount: (100).algo() })
    await localnet.algorand.send.payment({ sender: deployerAccount.addr, receiver: buyer.addr, amount: (100).algo() })
    await localnet.algorand.send.payment({
      sender: deployerAccount.addr,
      receiver: investor.addr,
      amount: (100).algo(),
    })

    const createResult = await client.send.createInvoice({
      sender: seller.addr,
      args: {
        buyer: buyer.addr.toString(),
        totalAmount: 100_000_000n,
        minInvestment: 10_000_000n,
        dueDate: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
      },
    })
    const invoiceId = createResult.return!

    await client.send.approveInvoice({
      sender: buyer.addr,
      args: { invoiceId },
    })

    // Try to invest below minimum (5 ALGO)
    const investParams = await client.params.investInInvoice({
      args: {
        payment: await localnet.algorand.createTransaction.payment({
          sender: investor.addr,
          receiver: seller.addr,
          amount: (5).algo(),
        }),
        invoiceId,
      },
      sender: investor.addr,
    })

    await expect(localnet.algorand.send.appCallMethodCall(investParams)).rejects.toThrow()
  })

  test('Prevents investment in non-active invoice', async () => {
    const { generateAccount } = localnet.context
    const deployerAccount = await generateAccount({ initialFunds: (400).algo() })
    const { client } = await deploy(deployerAccount.addr)

    const seller = await localnet.algorand.account.random()
    const buyer = await localnet.algorand.account.random()
    const investor = await localnet.algorand.account.random()

    await localnet.algorand.send.payment({ sender: deployerAccount.addr, receiver: seller.addr, amount: (100).algo() })
    await localnet.algorand.send.payment({ sender: deployerAccount.addr, receiver: buyer.addr, amount: (100).algo() })
    await localnet.algorand.send.payment({
      sender: deployerAccount.addr,
      receiver: investor.addr,
      amount: (100).algo(),
    })

    const createResult = await client.send.createInvoice({
      sender: seller.addr,
      args: {
        buyer: buyer.addr.toString(),
        totalAmount: 100_000_000n,
        minInvestment: 10_000_000n,
        dueDate: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
      },
    })
    const invoiceId = createResult.return!

    // Try to invest before approval
    const investParams = await client.params.investInInvoice({
      args: {
        payment: await localnet.algorand.createTransaction.payment({
          sender: investor.addr,
          receiver: seller.addr,
          amount: (20).algo(),
        }),
        invoiceId,
      },
      sender: investor.addr,
    })

    await expect(localnet.algorand.send.appCallMethodCall(investParams)).rejects.toThrow()
  })

  test('Seller receives funds immediately on investment', async () => {
    const { generateAccount } = localnet.context
    const deployerAccount = await generateAccount({ initialFunds: (300).algo() })
    const { client } = await deploy(deployerAccount.addr)

    const seller = await localnet.algorand.account.random()
    const buyer = await localnet.algorand.account.random()
    const investor = await localnet.algorand.account.random()

    await localnet.algorand.send.payment({ sender: deployerAccount.addr, receiver: seller.addr, amount: (10).algo() })
    await localnet.algorand.send.payment({ sender: deployerAccount.addr, receiver: buyer.addr, amount: (100).algo() })
    await localnet.algorand.send.payment({
      sender: deployerAccount.addr,
      receiver: investor.addr,
      amount: (100).algo(),
    })

    const createResult = await client.send.createInvoice({
      sender: seller.addr,
      args: {
        buyer: buyer.addr.toString(),
        totalAmount: 100_000_000n,
        minInvestment: 10_000_000n,
        dueDate: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
      },
    })
    const invoiceId = createResult.return!

    await client.send.approveInvoice({
      sender: buyer.addr,
      args: { invoiceId },
    })

    const sellerBalanceBefore = await localnet.algorand.account.getInformation(seller.addr)

    const investParams = await client.params.investInInvoice({
      args: {
        payment: await localnet.algorand.createTransaction.payment({
          sender: investor.addr,
          receiver: seller.addr,
          amount: (50).algo(),
        }),
        invoiceId,
      },
      sender: investor.addr,
    })

    await localnet.algorand.send.appCallMethodCall(investParams)

    const sellerBalanceAfter = await localnet.algorand.account.getInformation(seller.addr)

    const before = sellerBalanceBefore.balance.microAlgo
    const after = sellerBalanceAfter.balance.microAlgo

    expect(after).toBeGreaterThanOrEqual(before + 50_000_000n)
  })

  test('Prevents double claiming and unauthorized invoice payment', async () => {
    const { generateAccount } = localnet.context
    const deployerAccount = await generateAccount({ initialFunds: (520).algo() })
    const { client } = await deploy(deployerAccount.addr)

    const seller = await localnet.algorand.account.random()
    const buyer = await localnet.algorand.account.random()
    const investor = await localnet.algorand.account.random()
    const attacker = await localnet.algorand.account.random()

    // Fund accounts
    await localnet.algorand.send.payment({ sender: deployerAccount.addr, receiver: seller.addr, amount: (100).algo() })
    await localnet.algorand.send.payment({ sender: deployerAccount.addr, receiver: buyer.addr, amount: (150).algo() })
    await localnet.algorand.send.payment({
      sender: deployerAccount.addr,
      receiver: investor.addr,
      amount: (105).algo(), // Extra for fees since investor will send 100 ALGO
    })
    await localnet.algorand.send.payment({
      sender: deployerAccount.addr,
      receiver: attacker.addr,
      amount: (105).algo(), // Extra for fees
    })

    // Create, approve, and fund invoice
    const createResult = await client.send.createInvoice({
      sender: seller.addr,
      args: {
        buyer: buyer.addr.toString(),
        totalAmount: 100_000_000n,
        minInvestment: 10_000_000n,
        dueDate: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
      },
    })
    const invoiceId = createResult.return!

    await client.send.approveInvoice({
      sender: buyer.addr,
      args: { invoiceId },
    })

    const investParams = await client.params.investInInvoice({
      args: {
        payment: await localnet.algorand.createTransaction.payment({
          sender: investor.addr,
          receiver: seller.addr,
          amount: (100).algo(),
        }),
        invoiceId,
      },
      sender: investor.addr,
    })
    await localnet.algorand.send.appCallMethodCall(investParams)

    // Test 1: Non-buyer cannot pay invoice
    const attackerPayParams = await client.params.payInvoice({
      args: {
        payment: await localnet.algorand.createTransaction.payment({
          sender: attacker.addr,
          receiver: client.appAddress,
          amount: (100).algo(),
        }),
        invoiceId,
      },
      sender: attacker.addr,
    })

    await expect(localnet.algorand.send.appCallMethodCall(attackerPayParams)).rejects.toThrow()

    // Buyer pays invoice
    const payInvoiceParams = await client.params.payInvoice({
      args: {
        payment: await localnet.algorand.createTransaction.payment({
          sender: buyer.addr,
          receiver: client.appAddress,
          amount: (100).algo(),
        }),
        invoiceId,
      },
      sender: buyer.addr,
    })
    await localnet.algorand.send.appCallMethodCall(payInvoiceParams)

    // Investor claims once (should succeed)
    await client.send.claimPayout({
      sender: investor.addr,
      args: { invoiceId },
      staticFee: (2_000).microAlgo(),
    })

    // Test 2: Cannot claim twice
    await expect(
      client.send.claimPayout({
        sender: investor.addr,
        args: { invoiceId },
        staticFee: (2_000).microAlgo(),
      }),
    ).rejects.toThrow()
  })
})
