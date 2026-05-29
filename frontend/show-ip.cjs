const os = require('os')

const ifaces = os.networkInterfaces()
const results = []

for (const name of Object.keys(ifaces)) {
  for (const iface of ifaces[name]) {
    if (iface.family !== 'IPv4' || iface.internal) continue
    results.push({ name, address: iface.address })
  }
}

const priority = results.filter(
  (r) => r.address.startsWith('192.168.') || r.address.startsWith('10.')
)
const others = results.filter(
  (r) => !r.address.startsWith('192.168.') && !r.address.startsWith('10.')
)
const sorted = [...priority, ...others]

if (sorted.length === 0) {
  console.log('未找到局域网 IP，请检查网络连接。')
  process.exit(1)
}

console.log('\n本机局域网地址：\n')
for (const { name, address } of sorted) {
  console.log(`  网卡: ${name}`)
  console.log(`  地址: http://${address}:5173\n`)
}
