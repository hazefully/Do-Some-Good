var express = require("express");
var request = require("request");
var bodyParser = require("body-parser");
var mongoose = require("mongoose");

var db = mongoose.connect(process.env.MONGODB_URI);

var entry = require("./models/entry");
var session = require("./models/session");

var app = express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.get("/", function (req, res) {
	res.send("Deployed!");
});

app.get("/webhook", function (req, res) {
  if (req.query["hub.verify_token"] === process.env.VERIFICATION_TOKEN) {
    console.log("Verified webhook");
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Verification failed. The tokens do not match.");
    res.sendStatus(403);
  }
});

app.post('/webhook', function (req, res) {
	var data = req.body;

	if (data.object === 'page') {

		data.entry.forEach(function (entry) {
			var pageID = entry.id;
			var timeOfEvent = entry.time;

			entry.messaging.forEach(function(event) {
				console.log(event);
				if(event.message) {
					// All message events should be handled in processMessage()
					session.start(event, processMessage);
				} else if(event.postback) {
					// All postback events should be handled in processPostback()
		            session.start(event, processPostback);
				}
				else {
					console.log("Webhook recieved unknown event!");
				}
			});
		});
		res.sendStatus(200);
	}
});

function restartSession(event, sessionObj, callback) {
	console.log("Restarting Session!");
	sessionObj.remove( function(err, sessionObj) {
		if(err)
			console.error("Couldn't remove sessionObj!");
		else
			console.log("Session Removed Successfully!");
		session.start(event, callback);
	});
}

function processMessage(event, sessionObj) {

	console.log("New Message recieved!");
	if(sessionObj.step) {
		// if there's ongoing create new entry process
		createNewEntry(event, sessionObj);

	} else if(sessionObj.offset == 1) {
		attachs = event.message.attachments;

		if(!attachs || !attachs.length || attachs[0].type != 'location') {
			triggerListEntries(event, sessionObj);
		} else {
			sessionObj.lat = attachs[0].payload.coordinates.lat;
			sessionObj.long = attachs[0].payload.coordinates.long;
			sessionObj.save();
			entry.query(sessionObj, showList);
		}
	} else {
		getStarted(event, sessionObj);
	}
}

// Main events triggers

function triggerNewEntry(event, sessionObj) {
	if(!sessionObj.fresh)
		restartSession(event, sessionObj, triggerNewEntry);
	else {
		sessionObj.fresh = false;
		sessionObj.step = 1;
		sessionObj.new_entry = new entry.model({user_id: sessionObj.user_id});
	  	sessionObj.markModified('new_entry');
		sessionObj.save();

		request({
	        url: "https://graph.facebook.com/v2.6/" + sessionObj.user_id,
	        qs: {
	          access_token: process.env.PAGE_ACCESS_TOKEN,
	          fields: "first_name"
	        },
	        method: "GET"
	      }, function(error, response, body) {
	        var startNewEntry = "";
	        if (error) {
	          console.log("Error getting user's name!");
	          //console.log("Error getting user's name: " +  error);
	        } else {
	          var bodyObj = JSON.parse(body);
	          name = bodyObj.first_name;
	          startNewEntry = "Okay " + name + ", ";
	        }
	        var message = startNewEntry + "I will guide you through the process of adding a new entry."
	        sendTextMessage(sessionObj.user_id, message);
	      });

		createNewEntry(event, sessionObj);
	}
}
function triggerListEntries(event, sessionObj) {
	if(!sessionObj.fresh) {
		restartSession(event, sessionObj, triggerListEntries);
	}
	else {
		sessionObj.fresh = false;
		sessionObj.offset = 1;
		sessionObj.save();
		getLocation(event.sender.id, "Please share your location");
	}
}


function processPostback(event, sessionObj) {
	var userID = event.sender.id;
	var payload = event.postback.payload;
	console.log("New Postback recieved! :", payload);


	if (payload == "Greeting") {
		getStarted(event, sessionObj, true);
	}
	else if (payload == "NewEntry") {
		triggerNewEntry(event, sessionObj);
	}
	else if (payload == "ListEntries") {
		triggerListEntries(event, sessionObj);
	}
	else if(payload == "ViewMore") {
		if(sessionObj.offset <= 1)
			triggerListEntries(event, sessionObj);
		else
			session.query(sessionObj, showList);
	}
	else if(payload.type == 'entry') {
		showEntry(sessionObj, payload);
	}
	else if (payload == "ConfirmNewEntry") {
		if(sessionObj.step < 6) {
			sendTextMessage(userID, "Incomplete Data! Please try again.");
		}
		else {
			sendTextMessage(userID, "Thank you! Your efforts will help make this world a better world!");
			var newEntry = new entry.model(sessionObj.new_entry);
			newEntry.save();
		}
		getStarted(event, sessionObj);
	}
	else if(payload == "CancelNewEntry") {
		sendTextMessage(userID, "Your entry has been cancelled, please try again.");
    	getStarted(event, sessionObj);
	}
	// all other events should be handled before this one
	else if(sessionObj.step) {
		createNewEntry(event, sessionObj);
	}
}

function createNewEntry(event, sessionObj) {
	var userID = event.sender.id;
	if(event.message) {
		var messageText = event.message.text;
		var attachs = event.message.attachments;
		if(sessionObj.step == 2) {
			sessionObj.new_entry.name = messageText;
    		sessionObj.markModified('new_entry');
    		getLocation(userID, "Please share the location of this call for help");
		}
		else if(sessionObj.step == 3) {
			if(!attachs || !attachs.length || attachs[0].type != 'location') {
	    		sendTextMessage(userID, "Invalid Input!");
	    		getStarted(event, sessionObj);
	    		return;
	    	}
	    	sessionObj.new_entry.location.coordinates[1] = attachs[0].payload.coordinates.lat;
	    	sessionObj.new_entry.location.coordinates[0] = attachs[0].payload.coordinates.long;
	    	sessionObj.markModified('new_entry');

	    	var message = "Please specify a description for this call for help.";
			sendTextMessage(userID, message);
		}
		else if(sessionObj.step == 4) {
			sessionObj.new_entry.description = messageText;
    		sessionObj.markModified('new_entry');

    		var messageData = {
		        recipient: {
		          id: userID
		        },
		        message: {
		          text:"Please specify the priority of this call for help",
		             quick_replies:[
		               {
		                 content_type:"text",
		                 title: "High",
		                 payload: "High"
		               },
		               {
		                 content_type:"text",
		                 title: "Medium",
		                 payload: "Medium"

		               },
		               {
		                  content_type:"text",
		                  title: "Low",
		                  payload: "Low"
		               }
		             ]
		        }
			};
			callSendAPI(messageData);
		}
		else if(sessionObj.step == 5) {
			sessionObj.new_entry.priority = messageText;
    		sessionObj.markModified('new_entry');
    		sendTextMessage(userID, "Okay, let's review this entry\n");
    		showEntry(sessionObj, sessionObj.new_entry);

			messageData = {
				recipient:{
					id: userID
				},
				message:{
					attachment:{
						type: "template",
						payload:{
							template_type:"button",
							text:"Are you sure you want to add this entry?",
							buttons:[
								{
									type:"postback",
									title:"Yes",
									payload:"ConfirmNewEntry"
								},
								{
									type:"postback",
									title:"No",
									payload:"CancelNewEntry"
								}
							]
						}
					}       
				}
			};
			callSendAPI(messageData);
		}
		else {
			sendTextMessage(userID, "Invalid Input!");
    		getStarted(event, sessionObj);
    		return;
		}

	} else if(event.postback) {
		var payload = event.postback.payload;
		if(sessionObj.step == 1) {
			var message = "Please enter the full name of the person that needs help.";
      		sendTextMessage(userID, message);
		}
		else {
			sendTextMessage(userID, "Invalid Input!");
    		getStarted(event, sessionObj);
    		return;
		}
	}
	else {
		sendTextMessage(userID, "Invalid Input!");
		getStarted(event, sessionObj);
		return;
	}
	++sessionObj.step;
	sessionObj.save();
}

function showEntry(sessionObj, theEntry) {
	var message = "";
	message += "Full name: " + theEntry.name + "\n";
	message += "Description: " + theEntry.description + "\n";
	message += "Priority: " + theEntry.priority + "\n";
	sendTextMessage(sessionObj.user_id, message);

	var long = theEntry.location.coordinates[0];
	var lat = theEntry.location.coordinates[1];
		
	sendLocation(sessionObj, lat, long);
}

function sendLocation(sessionObj, lat, long) {
	var messageData = {
	    recipient: {
	      id: sessionObj.user_id
	    },
	    message: {
	      attachment: {
	        type: "template",
	        payload: {
	          template_type: "generic",
	          elements: [{
	            title: "Location",
	            image_url: "https:\/\/maps.googleapis.com\/maps\/api\/staticmap?size=764x400&center="+lat+","+long+"&zoom=25&markers="+lat+","+long,
			    item_url: "http:\/\/maps.apple.com\/maps?q="+lat+","+long+"&z=16"      		
	          }]
	        }
	      }
	    }
	};
	callSendAPI(messageData);
}

function getLocation(userID, message) {
	var messageData = {
		recipient: {
			id: userID
		},
		message: {
			text: message,
			quick_replies:[{ content_type:"location" }]
		}
	};
	callSendAPI(messageData);
}

function showList(sessionObj, list) {
	console.log("++++++++++++++++++++++++++++++++++");
	console.log("Enter showList");
	console.log(sessionObj);
	console.log(list);
	var offset = sessionObj.offset - 1;
	var elms = [
		{
    		title: 'View1',
	        subtitle: 'View1',

	        buttons: [{
	          title: "View1",
	          type: "postback",
	          payload: "ViewEntry1"
	          //payload: list[offset]
	        }]
    	},
    	{
    		title: 'View2',
	        subtitle: 'View2',

	        buttons: [{
	          title: "View2",
	          type: "postback",
	          payload: "ViewEntry2"
	          //payload: list[offset]
	        }]
    	},
    	{
    		title: 'View3',
	        subtitle: 'View3',

	        buttons: [{
	          title: "View3",
	          type: "postback",
	          payload: "ViewEntry3"
	          //payload: list[offset]
	        }]
    	},
    	{
    		title: 'View4',
	        subtitle: 'View4',

	        buttons: [{
	          title: "View4",
	          type: "postback",
	          payload: "ViewEntry4"
	          //payload: list[offset]
	        }]
    	}
	];
	var btns = [{
		title: "View More",
	    type: "postback",
	    payload: "ViewMore"
	}];

	/*if(offset + 5 < list.length)
		btns.push({
			title: "View More",
		    type: "postback",
		    payload: "ViewMore"
		});*/

	while(offset < list.length && btns.length < 5) {
		var titlle = list[offset].description;
    	var subtitlle = list[offset].priority;
    	elms.push({
    		title: titlle,
	        subtitle: subtitlle,

	        buttons: [{
	          title: "View",
	          type: "postback",
	          payload: "ViewEntry"
	          //payload: list[offset]
	        }]
    	});
    	++offset;
	}
	if(offset == list.length)
		sessionObj.offset = 0;
	else
		sessionObj.offset = offset + 1;

	var messageData = {
		recipient:{
			id: sessionObj.user_id
		},
		message:{
			attachment:{
				type : "template",
				payload:{
					template_type: "list",
					top_element_style: "compact",
					elements: elms,
					buttons: btns
				}
			}
		}
	}
	console.log(btns);
	console.log(elms);
	callSendAPI(messageData);
	sessionObj.save();
}

function getStarted(event, sessionObj, welcomeMessage = false) {
	var userID = event.sender.id;
	if(welcomeMessage) {
		request({
	      url: "https://graph.facebook.com/v2.6/" + userID,
	      qs: {
	        access_token: process.env.PAGE_ACCESS_TOKEN,
	        fields: "first_name"
	      },
	      method: "GET"
	    }, function(error, response, body) {
	      var greeting = "";
	      if (error) {
	        //console.log("Error getting user's name: " +  error);
	        console.log("Error getting user's name!");
	      } else {
	        var bodyObj = JSON.parse(body);
	        name = bodyObj.first_name;
	        greeting = "Hi " + name + "!\n";
	      }
	      var message = greeting + "This messanger bot allows you to reach poor people who need help in your area, and also add information about people who need help so other users can reach them too. Together, we can create a better world!";
	      sendTextMessage(userID, message);
	    });
	}

  var messageData = {
    recipient: {
      id: userID
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "What do you want to do?",
            subtitle: "You can either add new calls for help, or list near calls for help",
            image_url: "https://cdn.pixabay.com/photo/2017/02/10/12/03/volunteer-2055010_960_720.png",
            buttons: [{
              type: "postback",
              title: "Add a call for help",
              payload: "NewEntry",
            }, {
              type: "postback",
              title: "List calls for help",
              payload: "ListEntries",
            }],
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);

  session.end(sessionObj);
}

function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText
    }
  };

  callSendAPI(messageData);
}

function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: process.env.PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent a message with id %s to recipient %s", 
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.log(recipientId);
      console.log(messageData);
      //console.error(response);
      //console.error(error);
    }
  });  
}



app.listen((process.env.PORT || 5000), function () {
	console.log("Server Started on Port %d", (process.env.PORT || 5000));
});
