import type { Account, bytes, uint64 } from '@algorandfoundation/algorand-typescript'
import {
  assert,
  BoxMap,
  Contract,
  Global,
  GlobalState,
  gtxn,
  itxn,
  op,
  Txn,
  Uint64,
} from '@algorandfoundation/algorand-typescript'
import { abimethod, Address, UintN64 } from '@algorandfoundation/algorand-typescript/arc4'

// Invoice status constants - wrapped in Uint64()
const INVOICE_PENDING = Uint64(0)
const INVOICE_ACTIVE = Uint64(1)
const INVOICE_FUNDED = Uint64(2)
const INVOICE_PAID = Uint64(3)

export class Tradeflow extends Contract {
  // Global state for tracking next invoice ID
  nextInvoiceId = GlobalState<uint64>({ initialValue: Uint64(0) })

  // Box storage for invoice data (using invoiceId as key)
  invoiceSellers = BoxMap<uint64, Account>({ keyPrefix: 'is' })
  invoiceBuyers = BoxMap<uint64, Account>({ keyPrefix: 'ib' })
  invoiceTotalAmounts = BoxMap<uint64, uint64>({ keyPrefix: 'ia' })
  invoiceAmountsRaised = BoxMap<uint64, uint64>({ keyPrefix: 'ir' })
  invoiceMinInvestments = BoxMap<uint64, uint64>({ keyPrefix: 'im' })
  invoiceDueDates = BoxMap<uint64, uint64>({ keyPrefix: 'id' })
  invoiceStatuses = BoxMap<uint64, uint64>({ keyPrefix: 'st' })

  // Box storage for investments (key: invoiceId concatenated with investor address)
  investments = BoxMap<bytes, uint64>({ keyPrefix: 'inv' })

  /**
   * Creates a new invoice
   * @param buyer - The company that will pay the invoice
   * @param totalAmount - Total face value of the invoice in microAlgos
   * @param minInvestment - Minimum investment amount in microAlgos
   * @param dueDate - Unix timestamp when invoice is due
   * @returns The new invoice ID
   */
  @abimethod()
  createInvoice(buyer: Address, totalAmount: UintN64, minInvestment: UintN64, dueDate: UintN64): UintN64 {
    const invoiceId = this.nextInvoiceId.value
    this.nextInvoiceId.value = invoiceId + 1

    // Store invoice data
    this.invoiceSellers(invoiceId).value = Txn.sender
    this.invoiceBuyers(invoiceId).value = buyer.native
    this.invoiceTotalAmounts(invoiceId).value = totalAmount.native
    this.invoiceAmountsRaised(invoiceId).value = Uint64(0)
    this.invoiceMinInvestments(invoiceId).value = minInvestment.native
    this.invoiceDueDates(invoiceId).value = dueDate.native
    this.invoiceStatuses(invoiceId).value = INVOICE_PENDING

    return new UintN64(invoiceId)
  }

  /**
   * Buyer approves an invoice, making it available for investment
   * @param invoiceId - The invoice to approve
   */
  @abimethod()
  approveInvoice(invoiceId: UintN64): void {
    const id = invoiceId.native
    assert(this.invoiceBuyers(id).exists, 'Invoice does not exist')
    assert(Txn.sender === this.invoiceBuyers(id).value, 'Only buyer can approve')
    assert(this.invoiceStatuses(id).value === INVOICE_PENDING, 'Invoice must be pending')

    this.invoiceStatuses(id).value = INVOICE_ACTIVE
  }

  /**
   * Investor buys part of an invoice
   * Must be called in a group transaction where payment comes first
   * @param payment - The payment transaction (must be first in group)
   * @param invoiceId - The invoice to invest in
   */
  @abimethod()
  investInInvoice(payment: gtxn.PaymentTxn, invoiceId: UintN64): void {
    const id = invoiceId.native
    assert(this.invoiceSellers(id).exists, 'Invoice does not exist')
    assert(this.invoiceStatuses(id).value === INVOICE_ACTIVE, 'Invoice must be active')

    const totalAmount = this.invoiceTotalAmounts(id).value
    const amountRaised = this.invoiceAmountsRaised(id).value
    const minInvestment = this.invoiceMinInvestments(id).value
    const seller = this.invoiceSellers(id).value

    // Verify payment
    assert(payment.receiver === seller, 'Payment must go to seller')
    assert(payment.amount >= minInvestment, 'Below minimum investment')
    assert(payment.amount <= totalAmount - amountRaised, 'Exceeds funding need')

    // Record investment
    const investmentKey = op.concat(op.itob(id), payment.sender.bytes)
    const currentInvestment: uint64 = this.investments(investmentKey).exists
      ? this.investments(investmentKey).value
      : Uint64(0)
    this.investments(investmentKey).value = currentInvestment + payment.amount

    // Update amount raised
    const newAmountRaised: uint64 = amountRaised + payment.amount
    this.invoiceAmountsRaised(id).value = newAmountRaised

    // Mark as funded if fully raised
    if (newAmountRaised >= totalAmount) {
      this.invoiceStatuses(id).value = INVOICE_FUNDED
    }
  }

  /**
   * Buyer pays the invoice to the contract
   * This happens when the invoice is due (e.g., Net 90 days)
   * @param payment - Payment transaction from buyer to contract
   * @param invoiceId - The invoice being paid
   */
  @abimethod()
  payInvoice(payment: gtxn.PaymentTxn, invoiceId: UintN64): void {
    const id = invoiceId.native
    assert(this.invoiceBuyers(id).exists, 'Invoice does not exist')
    assert(Txn.sender === this.invoiceBuyers(id).value, 'Only buyer can pay invoice')
    assert(this.invoiceStatuses(id).value === INVOICE_FUNDED, 'Invoice must be funded')

    // Verify payment goes to contract and matches invoice amount
    assert(payment.receiver === Global.currentApplicationAddress, 'Payment must go to contract')
    assert(payment.amount === this.invoiceTotalAmounts(id).value, 'Wrong payment amount')

    // Mark invoice as paid - funds now held in contract for distribution
    this.invoiceStatuses(id).value = INVOICE_PAID
  }

  /**
   * Investor claims their payout from a paid invoice
   * Can be called anytime after buyer has paid the invoice
   * @param invoiceId - The invoice to claim payout from
   */
  @abimethod()
  claimPayout(invoiceId: UintN64): void {
    const id = invoiceId.native
    assert(this.invoiceStatuses(id).value === INVOICE_PAID, 'Invoice not paid yet')

    // Get investor's investment
    const investmentKey = op.concat(op.itob(id), Txn.sender.bytes)
    assert(this.investments(investmentKey).exists, 'No investment found')
    const invested = this.investments(investmentKey).value
    assert(invested > Uint64(0), 'Already claimed or no investment')

    // Pay investor their share using inner transaction
    itxn
      .payment({
        receiver: Txn.sender,
        amount: invested,
        fee: Uint64(0), // Caller pays fees
      })
      .submit()

    // Mark as claimed by setting investment to 0
    this.investments(investmentKey).value = Uint64(0)
  }

  /**
   * Get invoice details
   * @param invoiceId - The invoice to query
   * @returns Basic invoice information as arrays
   */
  @abimethod({ readonly: true })
  getInvoiceInfo(invoiceId: UintN64): [Address, Address, UintN64, UintN64, UintN64] {
    const id = invoiceId.native
    assert(this.invoiceSellers(id).exists, 'Invoice does not exist')

    return [
      new Address(this.invoiceSellers(id).value),
      new Address(this.invoiceBuyers(id).value),
      new UintN64(this.invoiceTotalAmounts(id).value),
      new UintN64(this.invoiceAmountsRaised(id).value),
      new UintN64(this.invoiceStatuses(id).value),
    ]
  }

  /**
   * Get investor's investment in an invoice
   * @param invoiceId - The invoice
   * @param investor - The investor address
   * @returns Amount invested
   */
  @abimethod({ readonly: true })
  getInvestment(invoiceId: UintN64, investor: Address): UintN64 {
    const id = invoiceId.native
    const investmentKey = op.concat(op.itob(id), investor.native.bytes)
    const amount = this.investments(investmentKey).exists ? this.investments(investmentKey).value : Uint64(0)
    return new UintN64(amount)
  }
}
