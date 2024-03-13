const BitcoinP2P = require("bsv-p2p").default;
const bsv = require('@bsv/sdk')
const dns = require("dns")
const fs = require("fs")
const Reader = bsv.Utils.Reader
const sha256 = bsv.Hash.sha256
const different = (a1, a2) =>
  !(a1.length == a2.length &&
  a1.every(
    (element, index) => element === a2[index]
  ))

const same = (a1, a2) => !different(a1, a2)

const genesis = Array.from(Buffer.from('6fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000', 'hex'))
let prevHash = genesis
let height = 0
let latestFile
let lastHashGlobal


// open the directory of files, put the filenames into a list
function getTip() {
    const files = fs.readdirSync('headers/')
    if (files.length === 0) {
        console.log('starting from genesis')
        return genesis
    }
    const hashes = files.map(f => bsv.BigNumber.fromHex(Buffer.from(f.split('.')[0], 'hex').reverse().toString('hex'))).sort((a, b) => a.ucmp(b))
    let tip
    for (const h of hashes) {
        const filename = 'headers/' + h.toHex(32) + '.dat'
        // console.log({ filename })
        
        // read the last 81 bytes of the file
        const file = fs.readFileSync(filename)
        const r = new Reader(file)
        const numBlocks = r.readVarIntNum()
        height += numBlocks
        if (!!tip) continue
        const header = file.slice(-81)
        // check the prevhash
        const previous = Array.from(header.slice(4, 36))
        // is the previous hash one of the files?
        if (hashes.find(h => {
            const f = bsv.BigNumber.fromHex(Buffer.from(previous).reverse().toString('hex'))
            // console.log({ h, f })
            return h.ucmp(f) === 0
        })) {
            console.log('found previous')
        } else {
            keepLooking = false
            console.log('this must be the tip ' + h.toHex(32))
            // console.log({ h })
            tip = Buffer.from(h.toHex(32), 'hex')
            latestFile = filename
        }
    }
    prevHash = Array.from(tip.reverse())
    tip.reverse()
    return tip
}

async function startHeaderService() {
    const { address: node } = await dns.promises.lookup("seed-nodes.bsvb.tech")
    const port = 8333
    const ticker = "BSV"
    const segwit = false
    const validate = false
    const autoReconnect = true
    const disableExtmsg = false
    const mempoolTxs = false
    const DEBUG_LOG = false

    const peer = new BitcoinP2P({
        node,
        port,
        ticker,
        segwit,
        validate,
        autoReconnect,
        disableExtmsg,
        mempoolTxs,
        DEBUG_LOG,
        user_agent: '/Deggen SV/'
    })

    peer.on("addr", ({ addrs }) => {
    // List of connected peers
    for (const addr of addrs) {
        console.log(addr);
    }
    })
    peer.on("block_hashes", ({ hashes }) => {
    // New block hashes announced
    for (const hash of hashes) {
        console.log(`New block ${hash.toString("hex")} from ${node}`);
        
    }
    })
    peer.on("disconnected", console.log);
    peer.on("connected", console.log);
    peer.on("version", console.log);
    peer.on("message", args => {
        const { payload, command } = args
        if (command === 'reject') console.log(args)
        // All messages received
        if (command === 'headers') {
            // save the payload to a new file
            const r = new Reader(payload)
            const number = r.readVarIntNum()
            // console.log({ number, l: payload.length })
            for (let i = 0; i < number; i++) {
                const header = r.read(80)
                // console.log({ header: header.toString('hex') })
                const previous = Array.from(header.slice(4, 36))
                // console.log({ previous, prevHash })
                if (different(previous, prevHash)) throw Error('Invalid header')
                // console.log({ prevHash: bsv.Utils.toHex(prevHash), thisHash: bsv.Utils.toHex(thisHash) })
                prevHash = sha256(sha256(Array.from(header)))
                // console.log({ hash: toHex(prevHash) })
                r.read(1)
            }
            const from = Buffer.from(prevHash).reverse()
            const lastHash = from.toString('hex')
            if (lastHash === lastHashGlobal) return console.log({ lastHash })
            lastHashGlobal = lastHash
            const file = fs.createWriteStream('headers/' + lastHash + '.dat');
            file.write(payload);
            file.end();
            peer.getHeaders({ from });
        }
    });
    peer.on("error_message", console.error);
    peer.on("error_socket", console.error);

    await peer.connect(); // Resolves when connected

    const from = getTip()
    console.log({ height, latestFile, from })
    await peer.getHeaders({ from }); // Returns array of Headers
    // peer.getMempool(); // Request node for all mempool txs. Recommend not using. Nodes usually disconnect you.
    // await peer.ping(); // Returns Number. Te response time in milliseconds
    // await peer.getAddr(); // Request nodes connected peers list
    // await peer.getBlock("<block hash>"); // Hex string or 32 byte Buffer. If stream = true transactions will come through on peer.on('transactions'...
    // await peer.broadcastTx("<tx buffer>"); // Tx Buffer
    // peer.getTxs(["<txid>..."]); // Array of txid 32 byte Buffers
    // peer.fetchMempoolTxs((txids) => txids); // Return filtered txids to download mempool txs
    // peer.fetchNewBlocks((hashes) => hashes); // Return filtered block hashes to download new blocks

}

startHeaderService().finally(console.log)