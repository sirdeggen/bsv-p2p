const BitcoinP2P = require("bsv-p2p").default;
const bsv = require('@bsv/sdk')
const dns = require("dns")
const fs = require("fs")
const Reader = bsv.Utils.Reader
const sha256 = bsv.Hash.sha256
const compare = (a1, a2) =>
  !(a1.length == a2.length &&
  a1.every(
    (element, index) => element === a2[index]
  ))

const genesis = Array.from(Buffer.from('6fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000', 'hex'))
let prevHash = genesis

async function startHeaderService() {
    const { address: node } = await dns.promises.lookup("seed-nodes.bsvb.tech")
    const port = 8333
    const ticker = "BSV"
    const segwit = false
    const validate = false
    const autoReconnect = true
    const disableExtmsg = false
    const mempoolTxs = false
    const DEBUG_LOG = true

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
        // console.log(args)
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
                if (compare(previous, prevHash)) throw Error('Invalid header')
                prevHash = sha256(sha256(Array.from(header)))
                // console.log({ hash: toHex(prevHash) })
                r.read(1)
            }
            const from = Buffer.from(prevHash).reverse()
            const lastHash = from.toString('hex')
            const file = fs.createWriteStream(lastHash + '.dat');
            file.write(payload);
            file.end();
            console.log({ lastHash })
            peer.getHeaders({ from });
        }
    });
    peer.on("error_message", console.error);
    peer.on("error_socket", console.error);

    await peer.connect(); // Resolves when connected
    await peer.getHeaders({}); // Returns array of Headers
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