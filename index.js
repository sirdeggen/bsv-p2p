const BitcoinP2P = require("bsv-p2p").default
const bsv = require('@bsv/sdk')
const dns = require("dns")
const fs = require("fs")
const express = require('express')
const Reader = bsv.Utils.Reader
const Writer = bsv.Utils.Writer
const sha256 = bsv.Hash.sha256
const BigNumber = bsv.BigNumber
const different = (a1, a2) =>
  !(a1.length == a2.length &&
  a1.every(
    (element, index) => element === a2[index]
  ))

const same = (a1, a2) => !different(a1, a2)

const genesis = Buffer.from('6fe28c0ab6f1b372c1a6a246ae63f74f931e8365e15a089c68d6190000000000', 'hex')
let prevHash = genesis
let height = 0
let latestFile = 'headers/0000000.dat'
let lastHashGlobal
let catchingUp = true

// open the directory of files, put the filenames into a list
function getTip() {
    const files = fs.readdirSync('headers/')
    if (files.length === 0) {
        console.log('starting from genesis')
        return genesis
    }
    const heights = files.map(f => parseInt(f.split('.')[0])).sort((a,b) => b - a)
    const bnh = new BigNumber(heights[0])
    const filename = 'headers/' + bnh.toString(10,7) + '.dat'
    const file = fs.readFileSync(filename)
    const r = new Reader(file)
    const numBlocks = r.readVarIntNum()
    const last = file.slice(-81)
    const header = last.slice(0, 80)
    prevHash = sha256(sha256(Array.from(header)))
    const from = Buffer.from(prevHash).reverse()
    lastHashGlobal = from.toString('hex')
    latestFile = filename
    height = heights[0] + numBlocks
    return from
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
            console.log(`New block ${hash.toString("hex")}`)
        }
        if (hashes.length === 0) {
            console.log('no new blocks')
        } else {
            return peer.getHeaders({ from: [Buffer.from(lastHashGlobal, 'hex')] })
        }
    })
    // height divided by 2000 without remainder
    rmg = 
    peer.on("disconnected", console.log);
    peer.on("connected", console.log);
    peer.on("version", console.log);
    peer.on("message", args => {
        const startingHeight = height
        const { payload, command } = args
        if (command === 'reject') console.log(args)
        // All messages received
        if (command === 'headers') {
            const newHeaders = []
            const r = new Reader(payload)
            const number = r.readVarIntNum()
            // console.log({ number, l: payload.length })
            for (let i = 0; i < number; i++) {
                const header = r.read(80)
                newHeaders.push(header)
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
            if (lastHash === lastHashGlobal) {
                catchingUp = false
                return console.log({ height, lastHash })
            }
            height += number
            lastHashGlobal = lastHash
            console.log('dealing with new headers')
            // open the latest file, read the first varint, and append to it if it's less than 2000
            const f = fs.readFileSync(latestFile)
            const current = new Reader(f)
            let currentFileNumHeaders = current.readVarIntNum()
            if (currentFileNumHeaders < 2000) {
                const newTotal = currentFileNumHeaders + newHeaders.length
                if (newTotal > 2000) {
                    console.log('finishing one file and starting another')
                    const toWrite = newHeaders.slice(0, 2000 - currentFileNumHeaders)
                    const partFile = fs.createWriteStream(latestFile)
                    const w = new Writer()
                    w.writeVarIntNum(2000)
                    w.write(current.read())
                    toWrite.map(h => {
                        w.write(h)
                        w.write(0x00)
                    })
                    partFile.write(Buffer.from(w.toArray()))
                    partFile.end()
                    const remaining = newHeaders.slice(2000 - currentFileNumHeaders)
                    const wn = new Writer()
                    wn.writeVarIntNum(remaining.length)
                    remaining.map(h => {
                        wn.write(h)
                        wn.write(0x00)
                    })
                    const eh = (new BigNumber(height - height % 2000)).toString(10, 7)
                    const file = fs.createWriteStream('headers/' + eh + '.dat')
                    file.write(Buffer.from(wn.toArray()))
                    file.end()
                    latestFile = 'headers/' + eh + '.dat'
                } else {
                    console.log('appending to the current file')
                    const file = fs.createWriteStream(latestFile)
                    const w = new Writer()
                    w.writeVarIntNum(number + currentFileNumHeaders)
                    w.write(current.read())
                    newHeaders.map(h => {
                        w.write(h)
                        w.write(0x00)
                    })
                    file.write(Buffer.from(w.toArray()))
                    file.end()
                }
            } else {
                console.log('moving on to a new file')
                // just write the whole payload to a new file
                const eh = (new BigNumber(height - height % 2000)).toString(10, 7)
                const file = fs.createWriteStream('headers/' + eh + '.dat')
                file.write(payload)
                file.end()
                latestFile = 'headers/' + eh + '.dat'
            }
            console.log({ height, lastHash })
        }
    })
    peer.on("error_message", console.error);
    peer.on("error_socket", console.error);

    await peer.connect(); // Resolves when connected

    const from = getTip()
    console.log({ height, latestFile, from })
    return peer.getHeaders({ from })
}

const getHeight = () => height

const app = express()
app.get('/height/:height', (req, res) => {
    try {
        if (typeof req?.params?.height === 'undefined') throw Error('no height provided')
        res.setHeader('Content-Type', 'text/plain')
        const h = parseInt(req?.params?.height)
        const fh = h - (h % 2000)
        const bgh = new BigNumber(fh)
        const filename = 'headers/' + bgh.toString(10, 7) + '.dat'
        const file = fs.readFileSync(filename)
        const r = new Reader(file)
        const numBlocks = r.readVarIntNum()
        const offset = (h - fh) * 81
        const headers = r.read(offset + 81)
        // last header is
        const header = headers.slice(-81).slice(0,80)
        res.status(200).send(header.toString('hex'))
    } catch (error) {
        res.setHeader('Content-Type', 'text/plain')
        console.log({ error })
        if (error.message.startsWith('ENOENT: no such file or directory')) {
            res.status(400).send('unknown, tip is at ' + getHeight())
        } else {
            res.status(400).send(error.message)
        }
    }
})

const port = 80
startHeaderService().finally(() => {
    console.log('started header peer')
    app.listen(port, () => {
        console.log('started api on port ' + port)
    })
})
