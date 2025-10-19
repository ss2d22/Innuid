
<div align="center">
  <h1>💰 Innuid</h1>
  <p>Decentralized Invoice Factoring Platform on Algorand</p>
  <p><em>Instant liquidity for businesses. Fractional investing for everyone.</em></p>

  <div>
    <img src="https://img.shields.io/badge/-Algorand-000000?style=for-the-badge&logo=algorand&logoColor=white" alt="Algorand" />
    <img src="https://img.shields.io/badge/-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/-React-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
    <img src="https://img.shields.io/badge/-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/-Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS" />
    <img src="https://img.shields.io/badge/-shadcn/ui-000000?style=for-the-badge&logo=shadcnui&logoColor=white" alt="shadcn/ui" />
    <img src="https://img.shields.io/badge/-AlgoKit-00D4AA?style=for-the-badge" alt="AlgoKit" />
  </div>
</div>

---

## 📺 Demo Video

> 🎬 **[WATCH DEMO VIDEO HERE]**


[<img src="https://img.youtube.com/vi/1XF7Iokt0PI/hqdefault.jpg" width="560" height="315"
/>](https://www.youtube.com/embed/1XF7Iokt0PI?si=_5zMi9GBvGkADXXc)

---

## 🖼️ Screenshots

### Dashboard View
<img width="1202" height="1031" alt="image" src="https://github.com/user-attachments/assets/7c43a13e-2597-488e-bf71-6a79c75e525b" />


### Invoice Creation
<img width="402" height="541" alt="image" src="https://github.com/user-attachments/assets/e7e8653d-239f-4d57-95c9-4388374fd5e4" />


---

## 📖 About

**Innuid** is a revolutionary blockchain-based invoice factoring platform built on Algorand that democratizes access to short-term business financing. It connects businesses needing immediate cash flow with a distributed network of investors seeking stable returns.

### The Problem We Solve

**For Small Businesses:**
- 🕐 30-90 day payment terms create cash flow crises
- 💸 Traditional factoring costs 3-5% in fees
- 🏦 Banks require lengthy applications and collateral
- 🚫 Limited access for small/new businesses

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│         React Frontend (shadcn/ui)              │
│  ┌──────────────────────────────────────────┐   │
│  │  Typed AppClient (Auto-generated)        │   │
│  └────────────────┬─────────────────────────┘   │
└───────────────────┼─────────────────────────────┘
                    │ AlgoKit Utils TS
                    ▼
┌─────────────────────────────────────────────────┐
│        Algorand Smart Contract Layer            │
│  ┌──────────────────────────────────────────┐   │
│  │  Innuid Contract (Algorand TypeScript)│   │
│  │                                           │   │
│  │  Global State: nextInvoiceId             │   │
│  │                                           │   │
│  │  Box Storage (BoxMaps):                  │   │
│  │  ├─ invoiceSellers[id] → Account         │   │
│  │  ├─ invoiceBuyers[id] → Account          │   │
│  │  ├─ invoiceTotalAmounts[id] → uint64     │   │
│  │  ├─ invoiceAmountsRaised[id] → uint64    │   │
│  │  ├─ invoiceStatuses[id] → uint64         │   │
│  │  └─ investments[id+addr] → uint64        │   │
│  │                                           │   │
│  │  Methods:                                 │   │
│  │  ├─ createInvoice() → invoiceId          │   │
│  │  ├─ approveInvoice(id)                   │   │
│  │  ├─ investInInvoice(payment, id)         │   │
│  │  ├─ payInvoice(payment, id)              │   │
│  │  └─ claimPayout(id) → Inner Txn          │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 🔗 Smart Contract Details

### 📍 Deployed Contract

**TestNet Application ID**: `748002191`
**Explorer Link**: [View on Lora Explorer](https://lora.algokit.io/testnet/application/748002191)

### 🎯 How The Smart Contract Works

The Innuid smart contract is written in **Algorand TypeScript** and compiled to TEAL bytecode using PuyaTS. It leverages several unique Algorand features to enable trustless, scalable invoice factoring.

#### **Core Components**

**1. State Management**

```
// Global State - Single counter for invoice IDs
nextInvoiceId = GlobalState<uint64>({ initialValue: Uint64(0) })

// Box Storage - Unlimited scalability for invoices
invoiceSellers = BoxMap<uint64, Account>({ keyPrefix: 'is' })
invoiceBuyers = BoxMap<uint64, Account>({ keyPrefix: 'ib' })
invoiceTotalAmounts = BoxMap<uint64, uint64>({ keyPrefix: 'ia' })
invoiceAmountsRaised = BoxMap<uint64, uint64>({ keyPrefix: 'ir' })
invoiceMinInvestments = BoxMap<uint64, uint64>({ keyPrefix: 'im' })
invoiceDueDates = BoxMap<uint64, uint64>({ keyPrefix: 'id' })
invoiceStatuses = BoxMap<uint64, uint64>({ keyPrefix: 'st' })

// Investment Tracking - Composite key: invoiceId + investorAddress
investments = BoxMap<bytes, uint64>({ keyPrefix: 'inv' })
```

**Why Box Storage?**
- **Unlimited invoices**: Global state maxes out at 64 key-value pairs
- **Cost-effective**: ~$0.001-0.01 per invoice (vs $20-100 on Ethereum)
- **Dynamic allocation**: Boxes created on-demand as invoices are created
- **Per-investor tracking**: Each investor's stake tracked individually

**2. Invoice Lifecycle States**

```
const INVOICE_PENDING = Uint64(0)  // Created, awaiting buyer approval
const INVOICE_ACTIVE = Uint64(1)   // Approved, open for investment
const INVOICE_FUNDED = Uint64(2)   // Fully funded, awaiting payment
const INVOICE_PAID = Uint64(3)     // Paid by buyer, ready for claims
```

#### **Key Methods Explained**

**📝 createInvoice()**

```
@abimethod()
createInvoice(
  buyer: Address,
  totalAmount: UintN64,
  minInvestment: UintN64,
  dueDate: UintN64
): UintN64
```

**What it does:**
1. Generates unique invoice ID from global counter
2. Creates 7 box entries for invoice data
3. Sets status to `PENDING`
4. Returns invoice ID to seller

**Cost**: ~0.03 ALGO in box storage MBR

**✅ approveInvoice()**

```
@abimethod()
approveInvoice(invoiceId: UintN64): void
```

**What it does:**
1. Verifies caller is the designated buyer
2. Confirms invoice is in `PENDING` state
3. Updates status to `ACTIVE`

**Critical for trust**: Prevents sellers from creating fake invoices

**💰 investInInvoice()**

```
@abimethod()
investInInvoice(payment: gtxn.PaymentTxn, invoiceId: UintN64): void
```

**What it does:**
1. **Validates atomic transaction group** (payment + app call must be grouped)
2. Verifies payment goes to seller
3. Checks payment meets minimum investment
4. Records investment in composite-key box: `concat(invoiceId, investorAddress)`
5. Updates total amount raised
6. Changes status to `FUNDED` when fully financed

**Key security feature**: Atomic transactions
- Transaction 1: Investor sends ALGO to seller
- Transaction 2: Smart contract records investment
- **Both succeed or both fail** - no possibility of fake investments or lost funds

**💵 payInvoice()**

```
@abimethod()
payInvoice(payment: gtxn.PaymentTxn, invoiceId: UintN64): void
```

**What it does:**
1. Verifies caller is the buyer
2. Confirms invoice is `FUNDED`
3. **Validates payment goes to contract address** (not seller!)
4. Verifies full amount is paid
5. Updates status to `PAID`

**Design decision**: Funds held in contract escrow for investor payouts

**🎁 claimPayout()**

```
@abimethod()
claimPayout(invoiceId: UintN64): void
```

**What it does:**
1. Confirms invoice is `PAID`
2. Retrieves investor's stake from box storage
3. **Executes inner transaction** to send funds to investor
4. Sets investment to 0 to prevent double-claiming

**Inner Transaction Example:**
```
itxn
  .payment({
    receiver: Txn.sender,
    amount: invested,
    fee: Uint64(0),  // Caller pays transaction fee
  })
  .submit()
```

**Why inner transactions are revolutionary:**
- Smart contract sends payments autonomously
- No withdrawal pattern needed
- Atomic with state updates
- No intermediary required

**📊 getInvoiceInfo() & getInvestment()**

Read-only methods for querying contract state without transactions.

---

## 🚀 Why Algorand?

Innuid leverages Algorand-specific features that make this project **uniquely possible**:

### **1. Box Storage: Unlimited Scalability**

**Traditional Limitations:**
- Ethereum: 64 storage slots per contract (~$20-100 per slot)
- Solana: Rent-based storage (ongoing payments required)

**Algorand's Advantage:**
- **Unlimited boxes** per application
- **Fixed MBR cost**: `2500 + 400*(keySize + valueSize)` microAlgos
- **~$0.001 per invoice** vs $100+ on other chains

**Our Implementation:**
```
// Each invoice spans multiple BoxMaps
// Support for 10,000+ concurrent invoices
// Total storage cost: ~$10-100
```

### **2. Atomic Transactions: Security Without Complexity**

**The Challenge:**
How do you ensure payment and investment recording happen together?

**Algorand's Solution:**
```
// Transaction Group
[
  Payment: Investor → Seller (60 ALGO),
  AppCall: Record investment in contract
]
// Both succeed or both fail - guaranteed by protocol
```

**What this prevents:**
- ❌ Investor sends money but investment isn't recorded
- ❌ Investment recorded without actual payment
- ❌ Front-running or manipulation

### **3. Inner Transactions: Autonomous Smart Contracts**

**Traditional Approach:**
Users "withdraw" funds from contract (pull pattern)

**Algorand's Approach:**
Contract "sends" funds to users (push pattern)

```
// Contract autonomously sends payment
itxn.payment({
  receiver: investor,
  amount: return_amount
}).submit()
```

**Benefits:**
- No custody risk
- Instant settlement
- Atomic with state changes

### **4. Low Transaction Costs: Democratized Access**

**Cost Comparison:**

| Operation | Algorand | Ethereum |
|-----------|----------|----------|
| Transaction Fee | 0.001 ALGO (~$0.0001) | $5-50 |
| Create Invoice | ~0.03 ALGO (~$0.003) | $50-200 |
| Invest | 0.001 ALGO | $10-100 |
| Claim Payout | 0.001 ALGO | $10-50 |

**Impact:**
- Micro-investments of $1 are economically viable
- No platform fees needed
- Accessible to everyone

### **5. Instant Finality: Real-Time Operations**

**Algorand:** 2.6 second blocks with immediate finality
**Result:** Complete invoice flow really fast

**Compare to:**
- Ethereum: 12-15 seconds + reorg risk (wait 6-12 blocks)
- Bitcoin: 10 minutes + wait for confirmations
- Traditional finance: 3-5 business days


## 📁 Project Structure

```
Innuid/
├── projects/
│   └── Innuid-contracts/
│       ├── contracts/
│       │   └── contract.algo.ts          # Main smart contract
│       ├── __test__/
│       │   ├── contract.algo.spec.ts     # Unit tests
│       │   └── contract.e2e.spec.ts      # E2E tests
│       ├── deploy-config.ts              # Deployment script
│       └── artifacts/                    # Compiled contract + clients
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── InvoiceCard.tsx
│   │   │   ├── InvestmentForm.tsx
│   │   │   └── PayoutClaim.tsx
│   │   ├── lib/
│   │   │   └── algorand.ts               # Algorand client setup
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── tailwind.config.js
│   └── vite.config.ts
│
└── README.md
```

---

## 🎬 app walkthrough


https://github.com/user-attachments/assets/8992fbcc-bee9-4d97-add8-9e4781691fdb



---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ and npm
- Python 3.10+ (for AlgoKit)
- Docker (optional, for LocalNet)
- AlgoKit CLI

### Installation

**1. Install AlgoKit**

```
# macOS/Linux
brew install algorandfoundation/tap/algokit

# Windows
winget install algorandfoundation.algokit

# Or via pipx
pipx install algokit
```

**2. Clone the Repository**

```
git clone https://github.com/ss2d22/Innuid.git
cd Innuid
```

**3. Install Dependencies**

```
# Install all project dependencies
npm install

# Or use AlgoKit
algokit project bootstrap all
```

### Running Locally

**1. Start LocalNet (Optional)**

```
algokit localnet start
```

**2. Compile Smart Contract**

```
cd projects/Innuid-contracts
npm run build
```

**3. Run Tests**

```
# Unit tests
npm test

# E2E tests
npm run test:e2e
```

**4. Deploy to LocalNet**

```
npm run deploy:localnet
```

**5. Start Frontend**

```
cd ../../frontend
npm run dev
```

Visit `http://localhost:5173`

### Deploying to TestNet

**1. Configure Environment**

```
# Create .env file
DEPLOYER_MNEMONIC="your 25-word mnemonic"
ALGOD_TOKEN="your-algod-token"
ALGOD_SERVER="https://testnet-api.algonode.cloud"
```

**2. Deploy Contract**

```
npm run deploy:testnet
```

**3. Note the App ID**

The deployment script will output your application ID. Update your frontend configuration.

---

## 🧪 Testing

### Unit Tests

Tests individual contract methods in isolation using `TestExecutionContext`:

```
npm run test
```

**Example test:**
```
it('Creates invoice with correct initial state', () => {
  const contract = ctx.contract.create(Innuid)
  const invoiceId = contract.createInvoice(
    buyer,
    new UintN64(100_000_000),
    new UintN64(5_000_000),
    new UintN64(1735689600)
  )

  expect(invoiceId.native).toEqual(Uint64(0))
})
```

### E2E Tests

Tests complete user flows on LocalNet:

```
npm run test:e2e
```

**Example flow:**
```
1. Deploy contract
2. Create invoice as seller
3. Approve invoice as buyer
4. Invest as multiple investors
5. Pay invoice as buyer
6. Claim payouts as investors
```

---

## 💡 Usage Examples

### Creating an Invoice

```
const factory = algorand.client.getTypedAppFactory(InnuidFactory)
const { appClient } = await factory.deploy()

const result = await appClient.send.createInvoice({
  sender: seller.addr,
  args: {
    buyer: buyer.addr.toString(),
    totalAmount: 100_000_000n,  // 100 ALGO
    minInvestment: 5_000_000n,  // 5 ALGO
    dueDate: BigInt(Date.now() / 1000 + 30 * 86400), // 30 days
  },
})

const invoiceId = result.return! // Invoice ID for tracking
```

### Investing in an Invoice

```
// Create grouped transaction
const paymentTxn = await algorand.createTransaction.payment({
  sender: investor.addr,
  receiver: seller.addr,
  amount: (50).algo(),
})

const investParams = await appClient.params.investInInvoice({
  args: {
    payment: paymentTxn,
    invoiceId: 0n,
  },
  sender: investor.addr,
})

// Send atomic transaction
await algorand.send.appCallMethodCall(investParams)
```

### Claiming Payout

```
const result = await appClient.send.claimPayout({
  sender: investor.addr,
  args: { invoiceId: 0n },
})

// Investor receives funds via inner transaction
// Investment automatically marked as claimed
```

---

## 🌍 Deployed Application

**TestNet Deployment:**
- **Application ID**: 748002191
- **Block Explorer**: [View on Lora](https://lora.algokit.io/testnet/application/748002191)
- **Frontend URL**: httpd://www.inuid.org

**Contract State:**
- Global State: 1 variable (`nextInvoiceId`)
- Box Storage: Dynamic allocation
- Total Deployed Size: ~2KB


## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Write tests for new features
- Follow TypeScript best practices
- Use conventional commit messages
- Update documentation as needed

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Team

- **Developers**: Sriram Sundar + Rudrrayan Manna
- **Contacts**: ss2d22@soton.ac.uk + rudrrayan@mgmail.com
- **GitHubs**: [@Sriram](https://github.com/ss2d22) [@Rudrrayan](https://github.com/ron0studios)

---

## 🙏 Acknowledgments

- **Algorand Foundation** - For the incredible blockchain platform
- **AlgoKit Team** - For the development framework
- **shadcn/ui** - For the beautiful component library

---

## 📚 Additional Resources

- [Algorand Developer Portal](https://developer.algorand.org/)
- [AlgoKit Documentation](https://developer.algorand.org/algokit/)
- [Algorand TypeScript Docs](https://github.com/algorandfoundation/puya-ts)
- [Box Storage Guide](https://developer.algorand.org/docs/get-details/dapps/smart-contracts/apps/state/#box-storage)
- [Atomic Transactions](https://developer.algorand.org/docs/get-details/atomic_transfers/)

---

## 📞 Support

For questions, issues, or suggestions:

- Open an issue on [GitHub Issues](https://github.com/ss2d22/Innuid/issues)
- Join the [Algorand Discord](https://discord.gg/algorand)
- Contact us directly: [@Sriram](https://github.com/ss2d22) [@Rudrrayan](https://github.com/ron0studios)

---

<div align="center">
  <h3>Built with ❤️ on Algorand</h3>
  <p>Empowering businesses and investors through decentralized finance</p>

  <p>
    <a href="https://lora.algokit.io/testnet/application/748002191">View Contract on Explorer</a>
    ·
    <a href="#demo-video">Watch Demo</a>
    ·
    <a href="https://github.com/ss2d22/Innuid/issues">Report Bug</a>
    ·
    <a href="https://github.com/ss2d22/Innuid/issues">Request Feature</a>
  </p>
</div>
