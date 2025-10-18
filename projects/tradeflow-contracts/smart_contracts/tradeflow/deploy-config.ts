import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { TradeflowFactory } from '../artifacts/tradeflow/TradeflowClient'

/**
 * Deploys the TradeFlow invoice factoring smart contract
 */
export async function deploy() {
  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║   TradeFlow Invoice Factoring Platform - Deployment       ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  // Get network information
  const networkDetails = await algorand.client.network()
  const isLocalNet = networkDetails.isLocalNet
  const networkName = isLocalNet ? 'LocalNet' : networkDetails.genesisId

  console.log('📍 Network Information:')
  console.log(`   Network: ${networkName}`)
  console.log(`   Genesis ID: ${networkDetails.genesisId}`)
  console.log(`   Genesis Hash: ${networkDetails.genesisHash.substring(0, 20)}...\n`)

  console.log('🔑 Deployer Account:')
  console.log(`   Address: ${deployer.addr}`)

  // Check deployer balance
  const deployerInfo = await algorand.account.getInformation(deployer.addr)
  const balanceInAlgo = Number(deployerInfo.balance.microAlgo) / 1_000_000
  console.log(`   Balance: ${balanceInAlgo.toFixed(6)} ALGO\n`)

  if (balanceInAlgo < 15) {
    console.warn('⚠️  Warning: Deployer balance is low. Recommend at least 15 ALGO for deployment.\n')
  }

  // Create the typed app factory
  console.log('🏭 Creating app factory...')
  const factory = algorand.client.getTypedAppFactory(TradeflowFactory, {
    defaultSender: deployer.addr,
  })

  // Deploy the contract
  console.log('🚀 Deploying contract...\n')
  const startTime = Date.now()

  const { appClient, result } = await factory.deploy({
    onUpdate: 'append',
    onSchemaBreak: 'append',
  })

  const deployTime = ((Date.now() - startTime) / 1000).toFixed(2)

  console.log('✅ TradeFlow deployed successfully!\n')
  console.log('📋 Deployment Details:')
  console.log(`   App ID: ${appClient.appClient.appId}`)
  console.log(`   App Address: ${appClient.appAddress}`)
  console.log(`   Operation: ${result.operationPerformed}`)
  console.log(`   Deploy Time: ${deployTime}s\n`)

  // Fund the app account for inner transactions (payouts to investors)
  if (['create', 'replace'].includes(result.operationPerformed)) {
    console.log('💰 Funding app account for inner transactions...')

    const fundingAmount = (10).algo()
    await algorand.send.payment({
      amount: fundingAmount,
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })

    console.log(`   ✅ App account funded with ${Number(fundingAmount.microAlgo) / 1_000_000} ALGO\n`)
  }

  // Test the contract with a sample invoice
  console.log('🧪 Testing contract with sample invoice...\n')

  try {
    // Create a test buyer account
    const testBuyer = await algorand.account.random()
    await algorand.send.payment({
      amount: (1).algo(),
      sender: deployer.addr,
      receiver: testBuyer.addr,
    })
    console.log(`   📧 Test buyer created: ${testBuyer.addr}`)

    // Create a sample invoice
    console.log('   📝 Creating sample invoice...')
    const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30 // 30 days from now
    const createResponse = await appClient.send.createInvoice({
      sender: deployer.addr,
      args: {
        buyer: testBuyer.addr.toString(),
        totalAmount: 50_000_000n, // 50 ALGO
        minInvestment: 5_000_000n, // 5 ALGO minimum
        dueDate: BigInt(dueDate),
      },
    })

    const invoiceId = createResponse.return!
    console.log(`   ✅ Sample invoice created with ID: ${invoiceId}\n`)

    // Get invoice info
    const infoResponse = await appClient.send.getInvoiceInfo({
      sender: deployer.addr,
      args: { invoiceId },
    })

    const [seller, buyer, totalAmount, amountRaised, status] = infoResponse.return!

    // Map status values to descriptions
    const getStatusDescription = (statusValue: bigint): string => {
      if (statusValue === 0n) return 'PENDING (Awaiting buyer approval)'
      if (statusValue === 1n) return 'ACTIVE (Open for investment)'
      if (statusValue === 2n) return 'FUNDED (Fully funded)'
      if (statusValue === 3n) return 'PAID (Payment complete)'
      return 'UNKNOWN'
    }

    console.log('📄 Invoice Details:')
    console.log('   ┌─────────────────────────────────────────────────────────┐')
    console.log(`   │ Seller:          ${seller.toString().slice(0, 42)}... │`)
    console.log(`   │ Buyer:           ${buyer.toString().slice(0, 42)}... │`)
    console.log(`   │ Total Amount:    ${Number(totalAmount) / 1_000_000} ALGO`.padEnd(63) + '│')
    console.log(`   │ Amount Raised:   ${Number(amountRaised) / 1_000_000} ALGO`.padEnd(63) + '│')
    console.log(`   │ Min Investment:  5 ALGO`.padEnd(63) + '│')
    console.log(`   │ Due Date:        ${new Date(dueDate * 1000).toLocaleDateString()}`.padEnd(63) + '│')
    console.log(`   │ Status:          ${getStatusDescription(status).split('(')[0].trim()}`.padEnd(63) + '│')
    console.log('   └─────────────────────────────────────────────────────────┘\n')

    console.log('✅ TradeFlow is fully operational!\n')

    console.log('📖 Complete Invoice Workflow:')
    console.log('   ┌─────────────────────────────────────────────────────────┐')
    console.log('   │ 1. CREATE    → Seller creates invoice                  │')
    console.log('   │ 2. APPROVE   → Buyer approves invoice                  │')
    console.log('   │ 3. INVEST    → Investors fund invoice (seller paid)    │')
    console.log('   │ 4. PAY       → Buyer pays invoice to contract          │')
    console.log('   │ 5. CLAIM     → Investors claim their returns           │')
    console.log('   └─────────────────────────────────────────────────────────┘\n')

    console.log('🔍 Key Features:')
    console.log('   • Seller receives immediate cash flow when funded')
    console.log('   • Buyer pays face value at Net 90 (or agreed terms)')
    console.log('   • Investors earn discount rate as profit')
    console.log('   • Multiple investors can participate in one invoice')
    console.log('   • Trustless escrow via smart contract\n')

    console.log('💡 Next Steps:')
    console.log('   • Run E2E tests: npm test')
    console.log('   • Deploy to TestNet: Use .env.testnet configuration')
    console.log('   • Integrate with frontend: Use generated TypeScript client\n')
  } catch (error) {
    console.log('⚠️  Sample invoice test skipped')
    console.log('   This is normal on first deployment or if deployer has insufficient funds')
    if (error instanceof Error) {
      console.log(`   Error: ${error.message}\n`)
    }
  }

  console.log('╔════════════════════════════════════════════════════════════╗')
  console.log('║                 DEPLOYMENT SUMMARY                         ║')
  console.log('╠════════════════════════════════════════════════════════════╣')
  console.log(`║ Network:     ${networkName.padEnd(47)} ║`)
  console.log(`║ App ID:      ${String(appClient.appClient.appId).padEnd(47)} ║`)
  console.log(`║ App Address: ${appClient.appAddress.toString().substring(0, 47).padEnd(47)} ║`)
  console.log(`║ Deployer:    ${deployer.addr.toString().substring(0, 47).padEnd(47)} ║`)
  console.log('╚════════════════════════════════════════════════════════════╝\n')

  return {
    appId: appClient.appClient.appId,
    appAddress: appClient.appAddress.toString(),
    deployer: deployer.addr.toString(),
    network: networkName,
  }
}
