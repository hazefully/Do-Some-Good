var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var EntrySchema = new Schema({
	// _id is a unique identifier to the entity
	type: {type: String, default: 'entry'},
	user_id: String,
  	name: {type: String, default: 'N/A'},
 	date: { type: Date, default: Date.now },
 	description: {type: String, default: 'N/A'},
 	
 	hidden: { type: Boolean, default: false }, // if downvotes - upvotes > C hide him from the results of nearby locations
 												// inorder to unhide some one back he needs to gain some upvotes again
 	priority: {type: String, default: 'Low'}, // range from  1 to 10
 	upvotes: { type: Number, default: 0 },
 	downvotes: { type: Number, default: 0 },
 	location : {
	    type: { 
			type: String,
			default: 'Point'
	    }, 
	    // [longitude, latitude]
	    coordinates: [Number]
  	}
});
EntrySchema.index({ location : '2dsphere' });

entry = mongoose.model("entry", EntrySchema);

module.exports.model = entry;
// maxDistance in meters
module.exports.query = function(sessionObj, callback) {
	entry.find(
	   {
	     location:
	       { $near :
	          {
	            $geometry: { type: "Point",  coordinates: [ sessionObj.long, sessionObj.lat ] },
	            //$minDistance: 1000,
	            $maxDistance: 5000
	          }
	       }
	   },
	function (error, results) {
		callback(sessionObj, results);
	});
}