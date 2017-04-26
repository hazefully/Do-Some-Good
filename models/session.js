var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var SessionSchema = new Schema({
	sender_id: Number,
	step: {type: Number, default: 0},
	new_entery: Object
	//vars: Object;
});

var session = mongoose.model("session", SessionSchema);


module.exports.start = function(event, callback) {
	session.find({'sender_id' : event.sender.id}, function(err, results) {
		if(err || !results.length)
			callback(event, new session({'sender_id': event.sender.id}));
		else
			callback(event, results[0]);
	});
}

module.exports.end = function(sessionObj) {
	session.remove(sessionObj, function(err) {
		if(err)
			console.error("Couldn't remove session!");
		else
			console.log("Session Removed Successfully");
	});
}