import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AlgoAmount } from '@algorandfoundation/algokit-utils/types/amount'
import { useWallet } from '@txnlab/use-wallet-react'
import algosdk from 'algosdk'
import { useEffect, useState } from 'react'
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
      <div className="flex items-center gap-4">
        <div className="text-sm">
          <div className="font-medium">Connected:</div>
          <div className="text-gray-600">
            {activeAddress.slice(0, 8)}...{activeAddress.slice(-8)}
          </div>
        </div>
        <button onClick={() => activeWallet?.disconnect()} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowWallets(!showWallets)}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 text-lg font-semibold"
      >
        Connect Wallet
      </button>

      {showWallets && (
        <div className="absolute top-full mt-2 bg-white border rounded-lg shadow-lg p-4 min-w-64 z-10">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Select Wallet</h3>
            <button onClick={() => setShowWallets(false)} className="text-gray-500 hover:text-gray-700">
              ✕
            </button>
          </div>
          <div className="space-y-2">
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
                className="w-full text-left px-4 py-3 border rounded hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <div className="font-medium">{wallet.metadata.name}</div>
                {wallet.isConnected && <div className="text-xs text-green-600">Connected</div>}
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
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-4">TradeFlow - Invoice Factoring</h1>
        <p className="text-gray-600 mb-4">Please connect your wallet to use TradeFlow</p>
        <WalletConnectButton />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">TradeFlow Invoice Factoring</h1>
          {appId > 0 && <p className="text-sm text-gray-500">App ID: {appId}</p>}
        </div>
        <WalletConnectButton />
      </div>

      {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{error}</div>}

      {success && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">{success}</div>}

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Create Invoice (Sellers)</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Buyer Address</label>
            <input
              type="text"
              value={buyer}
              onChange={(e) => setBuyer(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="BUYER_ADDRESS..."
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Total Amount (ALGO)</label>
              <input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="100"
                step="0.000001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Min Investment (ALGO)</label>
              <input
                type="number"
                value={minInvestment}
                onChange={(e) => setMinInvestment(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="10"
                step="0.000001"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Due in (days)</label>
              <input
                type="number"
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
                className="w-full border rounded px-3 py-2"
                placeholder="90"
              />
            </div>
          </div>

          <button
            onClick={handleCreateInvoice}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">All Invoices</h2>
          <button onClick={loadInvoices} className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 text-sm">
            Refresh
          </button>
        </div>

        {invoices.length === 0 ? (
          <p className="text-gray-500">No invoices found. Create one above!</p>
        ) : (
          <div className="space-y-4">
            {invoices.map((invoice) => {
              const status = INVOICE_STATUS[invoice.status as keyof typeof INVOICE_STATUS]
              const isBuyer = invoice.buyer === activeAddress
              const isSeller = invoice.seller === activeAddress
              const fundingProgress = Math.min(100, Number((invoice.amountRaised * 100n) / invoice.totalAmount))

              return (
                <div key={invoice.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-xl font-semibold">Invoice #{invoice.id}</h3>
                      <span
                        className="inline-block px-2 py-1 rounded text-sm font-medium mt-1"
                        style={{
                          backgroundColor:
                            status.color === 'yellow'
                              ? '#fef3c7'
                              : status.color === 'blue'
                                ? '#dbeafe'
                                : status.color === 'green'
                                  ? '#d1fae5'
                                  : '#e9d5ff',
                          color:
                            status.color === 'yellow'
                              ? '#92400e'
                              : status.color === 'blue'
                                ? '#1e3a8a'
                                : status.color === 'green'
                                  ? '#065f46'
                                  : '#581c87',
                        }}
                      >
                        {status.label}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">{(Number(invoice.totalAmount) / 1_000_000).toFixed(2)} ALGO</div>
                      <div className="text-sm text-gray-500">
                        Raised: {(Number(invoice.amountRaised) / 1_000_000).toFixed(2)} ALGO ({fundingProgress.toFixed(0)}%)
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <span className="font-medium">Seller:</span>{' '}
                      <span className={isSeller ? 'text-blue-600 font-semibold' : ''}>
                        {invoice.seller.slice(0, 8)}...{invoice.seller.slice(-8)}
                        {isSeller && ' (You)'}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Buyer:</span>{' '}
                      <span className={isBuyer ? 'text-blue-600 font-semibold' : ''}>
                        {invoice.buyer.slice(0, 8)}...{invoice.buyer.slice(-8)}
                        {isBuyer && ' (You)'}
                      </span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${fundingProgress}%` }} />
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {isBuyer && invoice.status === 0 && (
                      <button
                        onClick={() => handleApproveInvoice(invoice.id)}
                        disabled={loading}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 text-sm"
                      >
                        Approve Invoice
                      </button>
                    )}

                    {invoice.status === 1 && (
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={selectedInvoiceId === invoice.id ? investAmount : ''}
                          onChange={(e) => {
                            setSelectedInvoiceId(invoice.id)
                            setInvestAmount(e.target.value)
                          }}
                          placeholder="Amount (ALGO)"
                          className="border rounded px-3 py-2 w-32 text-sm"
                          step="0.000001"
                        />
                        <button
                          onClick={() => handleInvest(invoice.id)}
                          disabled={loading || !investAmount}
                          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 text-sm"
                        >
                          Invest
                        </button>
                      </div>
                    )}

                    {isBuyer && invoice.status === 2 && (
                      <button
                        onClick={() => handlePayInvoice(invoice.id)}
                        disabled={loading}
                        className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 disabled:bg-gray-400 text-sm"
                      >
                        Pay Invoice ({(Number(invoice.totalAmount) / 1_000_000).toFixed(2)} ALGO)
                      </button>
                    )}

                    {invoice.status === 3 && (
                      <button
                        onClick={() => handleClaimPayout(invoice.id)}
                        disabled={loading}
                        className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-gray-400 text-sm"
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

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Check Your Investment</h2>
        <div className="flex gap-2">
          <input
            type="number"
            value={viewInvoiceId}
            onChange={(e) => setViewInvoiceId(e.target.value)}
            placeholder="Invoice ID"
            className="border rounded px-3 py-2"
          />
          <button onClick={checkMyInvestment} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            Check
          </button>
        </div>
        {myInvestment !== null && (
          <div className="mt-3 p-3 bg-blue-50 rounded">
            Your investment: <strong>{(Number(myInvestment) / 1_000_000).toFixed(6)} ALGO</strong>
          </div>
        )}
      </div>

      <div className="bg-gray-50 border rounded-lg p-6">
        <h2 className="text-xl font-bold mb-3">Invoice Workflow</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li>
            <strong>CREATE</strong> - Seller creates invoice with buyer address and terms
          </li>
          <li>
            <strong>APPROVE</strong> - Buyer approves invoice (status: PENDING → ACTIVE)
          </li>
          <li>
            <strong>INVEST</strong> - Investors fund invoice, seller gets paid immediately (ACTIVE → FUNDED)
          </li>
          <li>
            <strong>PAY</strong> - Buyer pays full amount to contract at due date (FUNDED → PAID)
          </li>
          <li>
            <strong>CLAIM</strong> - Investors claim their returns (PAID)
          </li>
        </ol>
      </div>
    </div>
  )
}
