var express = require("express");
var request = require("request");
var bodyParser = require("body-parser");

var app = express();
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

// server index page
app.get("/", function (req, res) {
	res.send("Deployed!");
});

// Facebook Webhook
// Used for verification
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

		// Iterate over each entry - there may be multiple if batched
		data.entry.forEach(function (entry) {
				var pageID = entry.id;
				var timeOfEvent = entry.time;

				//Iterate over each messaging event
				entry.messaging.forEach(function(event) {
					if(event.message) {
						receivedMessage(event);
					} else if(event.postback) {
            // console.log("I am supposed to handle something here?!");
            processPostback(event);
          }
          else {
						console.log("Webhook recieved unknown event: ", event);
					}
				});
		});
		res.sendStatus(200);
	}
});

function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;

  console.log("Received message for user %d and page %d at %d with message:", 
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var messageId = message.mid;

  var messageText = message.text;
  var messageAttachments = message.attachments;

  if (messageText) {

    // If we receive a text message, check to see if it matches a keyword
    // and send back the example. Otherwise, just echo the text we received.
    switch (messageText) {
      case 'generic':
        sendGenericMessage(senderID);
        break;

      default:
        sendTextMessage(senderID, messageText);
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}



function processPostback(event) {
  var senderId = event.sender.id;
  var payload = event.postback.payload;
  console.log(payload);
  if (payload === "Greeting") {
    // // Get user's first name from the User Profile API
    // // and include it in the greeting
    // request({
    //   url: "https://graph.facebook.com/v2.6/" + senderId,
    //   qs: {
    //     access_token: process.env.PAGE_ACCESS_TOKEN,
    //     fields: "first_name"
    //   },
    //   method: "GET"
    // }, function(error, response, body) {
    //   var greeting = "";
    //   if (error) {
    //     console.log("Error getting user's name: " +  error);
    //   } else {
    //     var bodyObj = JSON.parse(body);
    //     name = bodyObj.first_name;
    //     greeting = "Hi " + name + ". ";
    //   }
    //   var message = greeting + "My name is SP Movie Bot. I can tell you various details regarding movies. What movie would you like to know about?";
    //   sendTextMessage(senderId, {text: message});
    // });

    getStarted(event);
    // sendGenericMessage(senderId);
  }
}
function getStarted(event)
{
  request({
      url: "https://graph.facebook.com/v2.6/" + senderId,
      qs: {
        access_token: process.env.PAGE_ACCESS_TOKEN,
        fields: "first_name"
      },
      method: "GET"
    }, function(error, response, body) {
      var greeting = "";
      if (error) {
        console.log("Error getting user's name: " +  error);
      } else {
        var bodyObj = JSON.parse(body);
        name = bodyObj.first_name;
        greeting = "Hi " + name + "!\n";
      }
      var message = greeting + "This messanger bot allows you to reach poor people who need help in your area, and also add information about people who need help so other users can reach them too. Together, we can create a better world!";
      sendTextMessage(senderId, message);
    });
    sendGenericMessage(senderId);
}
function sendGenericMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "What do you want to do?",
            subtitle: "You can either add information about someone who isn't already present in the database, or list people who need help around your area.",
            image_url: "https://cdn.pixabay.com/photo/2017/02/10/12/03/volunteer-2055010_960_720.png",
            buttons: [{
              type: "postback",
              title: "Add a new call for help",
              payload: "NewEntry",
            }, {
              type: "postback",
              title: "List calls for help around my area",
              payload: "ListEntries",
            }],
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
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

      console.log("Successfully sent generic message with id %s to recipient %s", 
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(response);
      console.error(error);
    }
  });  
}



app.listen((process.env.PORT || 5000), function () {
	console.log("Server Started on Port %d", (process.env.PORT || 5000));
});

