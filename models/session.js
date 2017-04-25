var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var SessionSchema = new Schema({
	sender_id: Number,
	//vars: Object;
});

var session = mongoose.model("session", SessionSchema);


module.exports = fucntion (user_id) {
	return session.find({ 'sender_id': user_id }, 'vars', function (err, results) {
		if (err || !results.length) {
			console.log("New session created.");
			return new session({'sender_id' : user_id});
			//return new session({'sender_id' : user_id, 'vars' : new Object()});
		}
		console.log("session found for sender_id = %s", sender_id);
		return results[0];
	});
}