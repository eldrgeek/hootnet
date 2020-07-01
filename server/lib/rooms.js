const users = require('./users');
const rooms = {}
/* A room is a named object with a list of members and the identity of the last to join
*/
exports.all = ()=> {
    return rooms
}

exports.exists = (roomName) => {
    return rooms[roomName]
}
exports.connect = (roomName) => {
    const room = exports.exists(roomName)
    room.sequence = 0
    room.order.map((member,sequence) => {
        console.log("cascade", member)
    const nextSocket = users.getReceiver(member)
    nextSocket.emit("cascade", { index: sequence, members: room.order.length})

    })
}


exports.next = (roomName) => {
    const room = exports.exists(roomName)
    const sequence = ++room.sequence
    const members = room.order
    // console.log("next", members, sequence)
    if (sequence >= members.length) return false
    const thisMember = members[sequence - 1]
    const nextMember = members[sequence]
    const controlSocket = users.getReceiver(thisMember)
    console.log("connect ", thisMember, nextMember)

    controlSocket.emit("calljoin", { opts: {index: sequence - 1, members: members.length}, jointo: nextMember })
    return true
    
}
exports.create = (roomName) => {
    if(!rooms[roomName]) rooms[roomName] = { count: 0, members: {}, order:[] }
}
exports.join = (roomName, id) => {
    const room = exports.exists(roomName)
    if (room.members[id]) return
    room.members[id] = { }
    room.order.push(id)
}
exports.leave = (roomName, id) => {
    delete exports.exists(roomName).members[id]
    room.order = room.order.filter(theId=>id !== theId)
}
exports.lastId = (roomName) => {
    return exports.exists(roomName).lastId
}

exports.members = (roomName) => {
    return Object.keys(exports.exists(roomName).members)
}

