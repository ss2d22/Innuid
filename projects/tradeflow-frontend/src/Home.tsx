'use client'

import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { useWallet } from '@txnlab/use-wallet-react'
import algosdk from 'algosdk'
import { AlertCircle, CheckCircle2, DollarSign, FileText, TrendingUp, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ThemeToggle } from './components/ThemeToggle'
import { TradeflowClient } from './contracts/Tradeflow'
import { getAlgodConfigFromViteEnvironment } from './utils/network/getAlgoClientConfigs'

const INVOICE_STATUS = {
  0: { label: 'PENDING', color: 'yellow' },
  1: { label: 'ACTIVE', color: 'blue' },
  2: { label: 'FUNDED', color: 'green' },
  3: { label: 'PAID', color: 'purple' },
}

interface Invoice {
  id: number
  seller: string
  buyer: string
  totalAmount: bigint
  amountRaised: bigint
  status: number
}

function WalletConnectButton() {
  const { wallets, activeWallet, activeAddress } = useWallet()
  const [showWallets, setShowWallets] = useState(false)

  if (activeAddress) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-card border border-border rounded-xl">
          <div className="w-2 h-2 bg-success rounded-full"></div>
          <div className="text-sm font-medium text-foreground">
            {activeAddress.slice(0, 6)}...{activeAddress.slice(-4)}
          </div>
        </div>
        <button
          onClick={() => activeWallet?.disconnect()}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowWallets(!showWallets)}
        className="bg-primary text-primary-foreground px-6 py-2.5 rounded-xl hover:opacity-90 transition-opacity font-medium text-sm flex items-center gap-2"
      >
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </button>

      {showWallets && (
        <div className="absolute top-full mt-2 right-0 bg-card border border-border rounded-xl shadow-2xl p-3 min-w-64 z-10">
          <div className="flex justify-between items-center mb-3 px-1">
            <h3 className="font-semibold text-foreground text-sm">Select Wallet</h3>
            <button
              onClick={() => setShowWallets(false)}
              className="text-muted-foreground hover:text-foreground transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="space-y-1.5">
            {wallets.map((wallet) => (
              <button
                key={wallet.id}
                onClick={async () => {
                  try {
                    await wallet.connect()
                    setShowWallets(false)
                  } catch (err) {
                    console.error('Failed to connect:', err)
                  }
                }}
                disabled={wallet.isConnected}
                className="w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="font-medium text-foreground text-sm">{wallet.metadata.name}</div>
                {wallet.isConnected && <div className="text-xs text-success mt-0.5">Connected</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const { activeAddress, transactionSigner } = useWallet()

  const [buyer, setBuyer] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [minInvestment, setMinInvestment] = useState('')
  const [dueDays, setDueDays] = useState('90')

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [investAmount, setInvestAmount] = useState('')
  const [viewInvoiceId, setViewInvoiceId] = useState('')
  const [myInvestment, setMyInvestment] = useState<bigint | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const appId = Number(import.meta.env.VITE_APP_ID || 0)

  const getAlgorandClient = () => {
    const algodConfig = getAlgodConfigFromViteEnvironment()
    return AlgorandClient.fromConfig({
      algodConfig: {
        server: algodConfig.server,
        port: algodConfig.port,
        token: algodConfig.token,
      },
    })
  }

  const getClient = () => {
    if (!activeAddress || !transactionSigner) {
      throw new Error('Wallet not connected')
    }

    const algorand = getAlgorandClient()
    algorand.setDefaultSigner(transactionSigner)

    return algorand.client.getTypedAppClientById(TradeflowClient, {
      appId: BigInt(appId),
      defaultSender: activeAddress,
    })
  }

  const handleCreateInvoice = async () => {
    setError('')
    setSuccess('')

    if (!buyer || !totalAmount || !minInvestment) {
      setError('Please fill in all fields')
      return
    }

    setLoading(true)

    try {
      const client = getClient()
      const dueDate = BigInt(Math.floor(Date.now() / 1000) + Number(dueDays) * 86400)

      const result = await client.send.createInvoice({
        args: {
          buyer: buyer,
          totalAmount: BigInt(Math.floor(Number(totalAmount) * 1_000_000)),
          minInvestment: BigInt(Math.floor(Number(minInvestment) * 1_000_000)),
          dueDate: dueDate,
        },
      })

      setSuccess(`Invoice created with ID: ${result.return}`)
      setBuyer('')
      setTotalAmount('')
      setMinInvestment('')
      await loadInvoices()
    } catch (err) {
      const error = err as Error
      setError(`Failed to create invoice: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleApproveInvoice = async (invoiceId: number) => {
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const client = getClient()
      await client.send.approveInvoice({
        args: { invoiceId: BigInt(invoiceId) },
      })
      setSuccess(`Invoice ${invoiceId} approved!`)
      await loadInvoices()
    } catch (err) {
      const error = err as Error
      setError(`Failed to approve: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleInvest = async (invoiceId: number) => {
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (!investAmount) {
        throw new Error('Enter investment amount')
      }

      const algorand = getAlgorandClient()
      algorand.setDefaultSigner(transactionSigner!)
      const client = getClient()

      const invoice = invoices.find((inv) => inv.id === invoiceId)
      if (!invoice) throw new Error('Invoice not found')

      const paymentTxn = await algorand.createTransaction.payment({
        sender: activeAddress!,
        receiver: invoice.seller,
        amount: AlgoAmount.Algos(Number(investAmount)),
      })

      const investParams = await client.params.investInInvoice({
        args: {
          payment: paymentTxn,
          invoiceId: BigInt(invoiceId),
        },
      })

      await algorand.send.appCallMethodCall(investParams)

      setSuccess(`Invested ${investAmount} ALGO in invoice ${invoiceId}!`)
      setInvestAmount('')
      setSelectedInvoiceId(null)
      await loadInvoices()
    } catch (err) {
      const error = err as Error
      setError(`Failed to invest: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handlePayInvoice = async (invoiceId: number) => {
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const algorand = getAlgorandClient()
      algorand.setDefaultSigner(transactionSigner!)
      const client = getClient()

      const invoice = invoices.find((inv) => inv.id === invoiceId)
      if (!invoice) throw new Error('Invoice not found')

      const appAddress = algosdk.getApplicationAddress(appId)

      const paymentTxn = await algorand.createTransaction.payment({
        sender: activeAddress!,
        receiver: appAddress,
        amount: AlgoAmount.MicroAlgos(Number(invoice.totalAmount)),
      })

      const payParams = await client.params.payInvoice({
        args: {
          payment: paymentTxn,
          invoiceId: BigInt(invoiceId),
        },
      })

      await algorand.send.appCallMethodCall(payParams)

      setSuccess(`Invoice ${invoiceId} paid!`)
      await loadInvoices()
    } catch (err) {
      const error = err as Error
      setError(`Failed to pay invoice: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleClaimPayout = async (invoiceId: number) => {
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      const client = getClient()
      await client.send.claimPayout({
        args: { invoiceId: BigInt(invoiceId) },
        staticFee: AlgoAmount.MicroAlgos(2000),
      })
      setSuccess(`Payout claimed from invoice ${invoiceId}!`)
      await loadInvoices()
    } catch (err) {
      const error = err as Error
      setError(`Failed to claim payout: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const loadInvoices = async () => {
    if (!activeAddress) return

    try {
      const client = getClient()
      const loadedInvoices: Invoice[] = []

      for (let i = 0; i < 20; i++) {
        try {
          const info = await client.send.getInvoiceInfo({
            args: { invoiceId: BigInt(i) },
          })

          if (info.return) {
            const [seller, buyer, totalAmount, amountRaised, status] = info.return
            loadedInvoices.push({
              id: i,
              seller,
              buyer,
              totalAmount,
              amountRaised,
              status: Number(status),
            })
          }
        } catch {
          break
        }
      }

      setInvoices(loadedInvoices)
    } catch {
      // silently fail
    }
  }

  const checkMyInvestment = async () => {
    if (!viewInvoiceId || !activeAddress) return

    try {
      const client = getClient()
      const result = await client.send.getInvestment({
        args: {
          invoiceId: BigInt(viewInvoiceId),
          investor: activeAddress,
        },
      })
      setMyInvestment(result.return || 0n)
    } catch {
      setMyInvestment(null)
    }
  }

  useEffect(() => {
    if (activeAddress && appId) {
      loadInvoices()
    }
  }, [activeAddress, appId])

  if (!activeAddress) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex justify-between items-center mb-20">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-foreground rounded-lg"></div>
              <h1 className="text-xl font-bold text-foreground">TradeFlow</h1>
            </div>
            <ThemeToggle />
          </div>

          <div className="max-w-2xl space-y-8 mb-20">
            <h2 className="text-5xl sm:text-6xl font-bold text-foreground leading-tight">
              Invoice factoring,
              <br />
              reimagined
            </h2>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Get instant liquidity for your invoices through decentralized funding on Algorand. Fast, transparent, and secure.
            </p>
            <div className="pt-4">
              <WalletConnectButton />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <div className="w-12 h-12 bg-card border border-border rounded-xl flex items-center justify-center">
                <FileText className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">Create invoices</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Sellers submit invoices that require buyer approval before funding
              </p>
            </div>
            <div className="space-y-3">
              <div className="w-12 h-12 bg-card border border-border rounded-xl flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">Get funded instantly</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Investors fund approved invoices and sellers receive immediate payment
              </p>
            </div>
            <div className="space-y-3">
              <div className="w-12 h-12 bg-card border border-border rounded-xl flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground text-lg">Earn returns</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Investors claim payouts when buyers settle their invoices</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-foreground rounded-lg"></div>
            <div>
              <h1 className="text-xl font-bold text-foreground">TradeFlow</h1>
              {appId > 0 && <p className="text-xs text-muted-foreground">App ID: {appId}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <WalletConnectButton />
          </div>
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-5 py-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="bg-success/10 border border-success/20 text-success px-5 py-4 rounded-xl flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <span className="text-sm">{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  All Invoices
                </h2>
              </div>
              <div className="p-6">
                {invoices.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-12 h-12 bg-muted rounded-xl flex items-center justify-center mx-auto mb-4">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">No invoices yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {invoices.map((invoice) => {
                      const status = INVOICE_STATUS[invoice.status as keyof typeof INVOICE_STATUS]
                      const isBuyer = invoice.buyer === activeAddress
                      const isSeller = invoice.seller === activeAddress
                      const fundingProgress = Math.min(100, Number((invoice.amountRaised * 100n) / invoice.totalAmount))

                      return (
                        <div key={invoice.id} className="border border-border rounded-xl p-5 hover:border-foreground/20 transition-colors">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-semibold text-foreground">Invoice #{invoice.id}</h3>
                                <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-foreground">{status.label}</span>
                              </div>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <div>
                                  Seller: {invoice.seller.slice(0, 8)}...{invoice.seller.slice(-6)}
                                  {isSeller && <span className="text-foreground font-medium"> (You)</span>}
                                </div>
                                <div>
                                  Buyer: {invoice.buyer.slice(0, 8)}...{invoice.buyer.slice(-6)}
                                  {isBuyer && <span className="text-foreground font-medium"> (You)</span>}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-foreground">
                                {(Number(invoice.totalAmount) / 1_000_000).toFixed(2)}
                              </div>
                              <div className="text-xs text-muted-foreground">ALGO</div>
                            </div>
                          </div>

                          <div className="mb-4">
                            <div className="flex justify-between text-xs text-muted-foreground mb-2">
                              <span>Funded</span>
                              <span>
                                {(Number(invoice.amountRaised) / 1_000_000).toFixed(2)} /{' '}
                                {(Number(invoice.totalAmount) / 1_000_000).toFixed(2)} ALGO
                              </span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                              <div
                                className="bg-foreground h-1.5 rounded-full transition-all duration-500"
                                style={{ width: `${fundingProgress}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex gap-2 flex-wrap">
                            {isBuyer && invoice.status === 0 && (
                              <button
                                onClick={() => handleApproveInvoice(invoice.id)}
                                disabled={loading}
                                className="bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity text-sm font-medium"
                              >
                                Approve Invoice
                              </button>
                            )}

                            {invoice.status === 1 && (
                              <div className="flex gap-2 flex-1">
                                <input
                                  type="number"
                                  value={selectedInvoiceId === invoice.id ? investAmount : ''}
                                  onChange={(e) => {
                                    setSelectedInvoiceId(invoice.id)
                                    setInvestAmount(e.target.value)
                                  }}
                                  placeholder="Amount (ALGO)"
                                  className="flex-1 min-w-0 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
                                  step="0.000001"
                                />
                                <button
                                  onClick={() => handleInvest(invoice.id)}
                                  disabled={loading || !investAmount}
                                  className="bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity text-sm font-medium"
                                >
                                  Invest
                                </button>
                              </div>
                            )}

                            {isBuyer && invoice.status === 2 && (
                              <button
                                onClick={() => handlePayInvoice(invoice.id)}
                                disabled={loading}
                                className="bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity text-sm font-medium"
                              >
                                Pay Invoice
                              </button>
                            )}

                            {invoice.status === 3 && (
                              <button
                                onClick={() => handleClaimPayout(invoice.id)}
                                disabled={loading}
                                className="bg-foreground text-background px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity text-sm font-medium"
                              >
                                Claim Payout
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">How it works</h2>
              </div>
              <div className="p-6">
                <ol className="space-y-4">
                  {[
                    { step: 'Create', desc: 'Seller creates invoice with buyer details' },
                    { step: 'Approve', desc: 'Buyer approves the invoice' },
                    { step: 'Fund', desc: 'Investors fund the invoice, seller gets paid' },
                    { step: 'Settle', desc: 'Buyer pays the full amount at due date' },
                    { step: 'Claim', desc: 'Investors claim their returns' },
                  ].map((item, idx) => (
                    <li key={idx} className="flex gap-4">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted text-foreground flex items-center justify-center text-xs font-semibold">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-medium text-foreground text-sm">{item.step}</div>
                        <div className="text-sm text-muted-foreground">{item.desc}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Create Invoice</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Buyer Address</label>
                  <input
                    type="text"
                    value={buyer}
                    onChange={(e) => setBuyer(e.target.value)}
                    className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
                    placeholder="BUYER_ADDRESS..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Total Amount (ALGO)
                  </label>
                  <input
                    type="number"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
                    placeholder="100"
                    step="0.000001"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                    Min Investment (ALGO)
                  </label>
                  <input
                    type="number"
                    value={minInvestment}
                    onChange={(e) => setMinInvestment(e.target.value)}
                    className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
                    placeholder="10"
                    step="0.000001"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Due in (days)</label>
                  <input
                    type="number"
                    value={dueDays}
                    onChange={(e) => setDueDays(e.target.value)}
                    className="w-full bg-background border border-input rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
                    placeholder="90"
                  />
                </div>

                <button
                  onClick={handleCreateInvoice}
                  disabled={loading}
                  className="w-full bg-foreground text-background px-6 py-3 rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity font-medium text-sm"
                >
                  {loading ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Check Investment</h2>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={viewInvoiceId}
                    onChange={(e) => setViewInvoiceId(e.target.value)}
                    placeholder="Invoice ID"
                    className="flex-1 bg-background border border-input rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
                  />
                  <button
                    onClick={checkMyInvestment}
                    className="bg-foreground text-background px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity font-medium text-sm"
                  >
                    Check
                  </button>
                </div>
                {myInvestment !== null && (
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wide">Your investment</p>
                    <p className="text-xl font-bold text-foreground">{(Number(myInvestment) / 1_000_000).toFixed(6)} ALGO</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
