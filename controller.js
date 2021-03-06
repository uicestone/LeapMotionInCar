var config = {
	breakBetweenGestures: 300
};

var gestureHistory = [];

var audioElement;

var canvas, context;

// Setup Leap loop with frame callback function
var controller = new Leap.Controller({enableGestures: true});

// to use HMD $scope.mode:
// controllerOptions.optimizeHMD = true;
var frames = [];
var resumeAt = 0;
var gestureResumeAt = 0;

var directions = [
	{
		name: 'x',
		sides: ['right', 'left']
	},
	{
		name: 'y',
		sides: ['up', 'down']
	},
	{
		name: 'z',
		sides: ['out', 'in']
	}
];

var scope;

function trackFinger(canvas, normalizedIndexTipPosition, pinchStrength){
	canvas.width = canvas.width; //clear
	
	// Convert the normalized coordinates to span the canvas
	var canvasX = canvas.width * normalizedIndexTipPosition[0];
	var canvasY = canvas.height * (1 - normalizedIndexTipPosition[1]);

	//we can ignore z for a 2D context
	var color = 128 - Math.round(pinchStrength * 255 / 2);
	context.fillStyle = 'rgb(' + color + ', ' + color + ', ' + color + ')';
	context.beginPath();
	context.arc(canvasX, canvasY, 35 - pinchStrength * 30, 0, Math.PI * 2 , true);
	context.closePath();
	context.fill();
}

var app = angular.module('leapmotion', []).controller('Ctrl', function($scope, $interval){

	$(function(){
		audioElement = document.getElementById('audio');
		canvas = document.getElementById('screen');
		context = canvas.getContext('2d');

		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;

	});

	scope = $scope;

	$scope.getFanSpeedNumber = function(num) {
	    return new Array(num);   
	}

	$scope.inMode = function(mode){
		return $scope.mode === mode;
	};

	$scope.enterMode = function(mode){
		$scope.mode = mode;

		switch(mode){
			case 'phone':
				$scope.car.phone.onCall();
				break;
			case 'media':
				$scope.car.media.play();
				break;
		}
	};

	$scope.getFileName = function(path){
		return path.match(/.*\/(.*?)\./)[1] || path;
	}

	$scope.isVolumeBarVisible = function(){
		return + new Date() < $scope.showVolumeBarUntil;
	}

	$scope.phoneStatusIn = function(status){
		return $scope.car.phone.status === status;
	}

	$scope.mode = 'window'; // window, ac, media, phone

	$scope.car = {

		windowsPosition: [
			0, // frontLeft
			0, // frontRight
			0, // rearLeft
			0, // rearRight
			0 // top
		], // 0: totally closed, 1: totally open

		windowMoving: {},

		openWindow: function(id){
			$scope.car.windowMoving[id] = $interval(function(){
				$scope.car.windowsPosition[id] += 0.05;
				if($scope.car.windowsPosition[id] > 1){
					$interval.cancel($scope.car.windowMoving[id]);
				}
			}, 100);
		},

		closeWindow: function(id){
			$scope.car.windowMoving[id] = $interval(function(){
				$scope.car.windowsPosition[id] -= 0.05;
				if($scope.car.windowsPosition[id] < 0){
					$interval.cancel($scope.car.windowMoving[id]);
				}
			}, 100);
		},

		stopWindow: function(id){
			return $interval.cancel($scope.car.windowMoving[id]);
		},

		ac: {
			isOn: false,
			fanSpeed: 2,
			fanSpeedRange: [1, 3],
			temperature: 25.0,
			temperatureRange: [16, 30]
		},

		media: {
			isOn: true,
			mode: 'music', // radio, cd
			channel: 0, 
			volume: 1.0, // 0-1, step by 0.1
			music: [
				"media_resource/听见下雨的声音.mp3",
				"media_resource/手写的从前.mp3",
				"media_resource/鞋子特大号.mp3",
				"media_resource/明明就.mp3"
			],
			radio: [
				"media_resource/radio.mp3",
			],
			playList: [],
			play: function(){

				$scope.car.media.playList = $scope.car.media[$scope.car.media.mode];

				audioElement.src = $scope.car.media.playList[$scope.car.media.channel];

				audioElement.play();

				audioElement.onended = function(){
					$scope.car.media.channel = $scope.car.media.channel === $scope.car.media.playList.length - 1 ? 0 : $scope.car.media.channel + 1;
				    audioElement.src = $scope.car.media.playList[$scope.car.media.channel];
				    audioElement.play();
					console.log('load: ' + $scope.car.media.playList[$scope.car.media.channel]);
				}
			}
		},

		phone: {
			status: 'calling in', // not connected, stand by, online, calling in
			contact: {
				name: '张三',
				number: 13012345678,
				avatar: 'media_resource/contact.jpg'
			},
			onCall: function(){
				// play ring tone
				$scope.car.phone.status = 'calling in';
				audioElement.src = 'media_resource/ring.mp3';
				audioElement.play();
				audioElement.onended = function(){
				    audioElement.play();
				}
			},
			answer: function(){
				$scope.car.phone.status = 'online',
				$interval(function(){
					$scope.car.phone.onlineTime ++;
				}, 1000);
				audioElement.src = '';
				$scope.$apply();
			},
			decline: function(){
				audioElement.src = '';
				$scope.enterMode('media');
				$scope.$apply();
			},
			onlineTime: 0
		}

	};

	$scope.car.media.playList = $scope.car.media.music;

	controller.on('frame', function(frame) {

		// no index finger data? next frame
		if(!frame.fingers[1])
			return;

		//Get a pointable and normalize the tip position
		var hand = frame.hands[0];
		var interactionBox = frame.interactionBox;
		var normalizedIndexTipPosition = interactionBox.normalizePoint(frame.fingers[1].tipPosition, true);
		var normalizedPalmPosition = interactionBox.normalizePoint(frame.hands[0].palmPosition, true);

		trackFinger(canvas, normalizedIndexTipPosition, hand.pinchStrength);

		// if we are having a break between 2 gestures
		if(resumeAt && new Date() < resumeAt)
			return;

		if(frame.hands[0].confidence < 0.5)
			return;

		// console.info(frame.hands[0].grabStrength, frame.hands[0].pinchStrength);

		for(var i = frames.length - 2; i >= 0; i--){

			if(frames[i].fingers[1]){
				
				var diff = {};
				directions.forEach(function(direction, index){
					diff[direction.name] = frame.fingers[1].tipPosition[index] - frames[i].fingers[1].tipPosition[index];
				});

				var diffGrab = frame.hands[0].grabStrength - frames[i].hands[0].grabStrength;
				var diffPinch = frame.hands[0].pinchStrength - frames[i].hands[0].pinchStrength;

				try{
					directions.forEach(function(direction, index){

						if(Math.abs(diff[direction.name]) > 80){

							if(diff[direction.name] * frame.fingers[1].direction[index] > 0 && Math.abs(frame.fingers[1].direction[index]) > 0.33){
								frames = [];
								resumeAt = +new Date() + 100;

								var gesture = diff[direction.name] > 0 ? direction.sides[0] : direction.sides[1];

								var sameGestureInHistory = gestureHistory.filter(function(item){
									return item.gesture === 'gesture: ' + gesture;
								});

								gestureHistory.push({
									timestamp: + new Date(),
									gesture: 'gesture: ' + gesture
								});

								// console.log(gestureHistory);

								if(sameGestureInHistory.length === 1){
									throw 'gesture: double ' + gesture;
								}

								throw 'gesture: ' + gesture;
							}

						}

					});

					if(Math.abs(diffGrab) > 0.6){
						frames = [];
						// console.log(diffGrab, 'compare to frame ' + i, frames.length, frame.timestamp - frames[0].timestamp);
						var gesture = diffGrab > 0 ? 'grabTight' : 'grabLoose';
						throw 'gesture: ' + gesture;
					}

					if(Math.abs(diffPinch) > 0.8){
						frames = [];
						var gesture = diffPinch > 0 ? 'pinchTight' : 'pinchLoose';
						throw 'gesture: ' + gesture;
					}


				}catch(message){

					console.info(message);
					
					if($scope.mode === 'media' && message === 'gesture: grabLoose' && normalizedPalmPosition[0] > 1/3 && normalizedPalmPosition[0] < 2/3){
						$scope.car.media.play();
					}

					if($scope.mode === 'ac' && message === 'gesture: grabLoose' && normalizedPalmPosition[0] > 1/3 && normalizedPalmPosition[0] < 2/3){
						$scope.car.ac.isOn = true;
					}

					if($scope.mode === 'ac' && message === 'gesture: grabTight' && normalizedPalmPosition[0] > 1/3 && normalizedPalmPosition[0] < 2/3){
						$scope.car.ac.isOn = false;
					}

					if($scope.mode === 'media' && message === 'gesture: grabTight' && Math.abs(normalizedPalmPosition[0]) > 1/3 && Math.abs(normalizedPalmPosition[0]) < 2/3 && normalizedPalmPosition[1] < 1/2){
						audioElement.load();
					}

					if(message === 'gesture: up' && $scope.mode === 'window'){
						$scope.car.stopWindow(0) || $scope.car.closeWindow(0);
						console.log('window close');
					}

					if(message === 'gesture: down' && $scope.mode === 'window'){
						$scope.car.stopWindow(0) || $scope.car.openWindow(0);
						console.log('window open');
					}

					if(message === 'gesture: out' && $scope.mode === 'window'){
						console.log('top window open');
					}

					if(message === 'gesture: in' && $scope.mode === 'window'){
						console.log('top window close');
					}

					if(message === 'gesture: pinchLoose' && $scope.mode === 'ac' && $scope.car.ac.isOn){
						$scope.car.ac.fanSpeed <= $scope.car.ac.fanSpeedRange[1] - 1 && $scope.car.ac.fanSpeed ++;
						$scope.$apply()
					}

					if(message === 'gesture: pinchTight' && $scope.mode === 'ac' && $scope.car.ac.isOn){
						$scope.car.ac.fanSpeed >= $scope.car.ac.fanSpeedRange[0] + 1 && $scope.car.ac.fanSpeed --;
						$scope.$apply()
					}

					resumeAt = +new Date() + config.breakBetweenGestures;
					break;

					// return;

				}

			}

		}

		frames.push(frame);

		// console.log('new frame pushed');

		while(frame.timestamp - frames[0].timestamp > 100000){
			frames.shift();
			// console.log('head frame shifted');
		}

		while(gestureHistory.length && (+new Date() - gestureHistory[0].timestamp > 1000)){
			gestureHistory.shift();
			// console.log('gesture frame shifted');
		}

		$scope.$apply();

		// console.log('frames stored: ' + frames.length);

	});

	controller.on('gesture', function(gesture, frame){

		// if we are having a break between 2 gestures
		if(gestureResumeAt && new Date() < gestureResumeAt)
			return;

		// console.log(gesture.type, gesture.state, gesture, frame.pointables);

		var interactionBox = frame.interactionBox;
		var normalizedIndexTipPosition = frame.fingers[1] && interactionBox.normalizePoint(frame.fingers[1].tipPosition, true);

		if(frame.hands.length){
			var normalizedPalmPosition = interactionBox.normalizePoint(frame.hands[0].palmPosition, true);
		}

		if($scope.mode === 'media' && gesture.type === 'circle'){


			var increase = gesture.normal[2] < 0 ? true : false;
			var amount = 0.0001 * gesture.radius;

			!increase && (amount = -amount);

			var volume = audioElement.volume || 1.0;

			volume = volume + amount;

			if(volume > 1 || volume < 0){
				return;
			}

			if($scope.car.media.volume.toFixed(1) !== volume.toFixed(1)){
				console.log('volume: ' + volume.toFixed(1));
			}

			$scope.showVolumeBarUntil = + new Date() + 1000;

			audioElement.volume = $scope.car.media.volume = volume;
		}

		if($scope.mode === 'ac' && gesture.type === 'circle'){

			var increase = gesture.normal[2] < 0 ? true : false;
			var amount = 0.0005 * gesture.radius;

			!increase && (amount = -amount);

			var temperature = $scope.car.ac.temperature;

			if((temperature > 30 && amount > 0) || (temperature < 16 && amount < 0) || !$scope.car.ac.isOn){
				return;
			}

			temperature += amount;

			if(temperature.toFixed(1) !== $scope.car.ac.temperature.toFixed(1)){
				console.log('temperature: ' + temperature.toFixed(1));
			}

			$scope.car.ac.temperature = temperature;
		}

		if($scope.mode === 'media' && gesture.type === 'keyTap'){

			var gesturePointable = frame.pointables.filter(function(pointable){
				return pointable.id === gesture.pointableIds[0] && pointable.type === 0;
			})

			if(gesturePointable.length){
				if(audioElement.paused){
					console.log('resumed');
					audioElement.play()
				}else{
					console.log('paused');
					audioElement.pause();
				}
			}
		}

		// if(gesture.type === 'screenTap'){
			
		// 	console.info('gesture: screenTap');

		// 	if(normalizedIndexTipPosition[1] > 2/3){
		// 		$scope.mode = 'window';
		// 	}
		// 	else if(normalizedIndexTipPosition[1] < 1/3){
		// 		$scope.mode = 'ac';
		// 	}
		// 	else if(normalizedIndexTipPosition[0] > 2/3){
		// 		$scope.mode = 'media';
		// 	}
		// 	else if(normalizedIndexTipPosition[0] < 1/3){
		// 		$scope.mode = 'phone';
		// 	}

		// 	console.log('mode: ' + $scope.mode);

		// 	$('.interface').hide();
		// 	$('.interface#' + $scope.mode).show()

		// }

		if(gesture.type === 'swipe'){

			// console.log(gesture, frame);

			directions.forEach(function(thisDirection, index){

				// console.log(thisDirection.name, gesture.direction[index],

				// 	directions.reduce(function(previous, current, index){
				// 		if(current.name !== thisDirection.name){
				// 			return previous && Math.abs(gesture.direction[index]) < 0.5;
				// 		}else{
				// 			return previous;
				// 		}
				// 	}, true)
				// );

				if(
					// distance of this direction >= 0.5
					Math.abs(gesture.direction[index]) >= 0.5
					&&
					// distances of both other 2 directions < 0.5
					directions.reduce(function(previous, current, index){
						if(current.name !== thisDirection.name){
							return previous && Math.abs(gesture.direction[index]) < 0.5;
						}else{
							return previous;
						}
					}, true)
				){
					gestureResumeAt = +new Date() + config.breakBetweenGestures;
					var swipeDirection = thisDirection.sides[gesture.direction[index] > 0 ? 0 : 1];
					console.info('gesture: swipe ' + swipeDirection);

					if(swipeDirection === 'down' && $scope.mode === 'media' && frame.hands[0].palmNormal[1] < 0){
						$scope.car.media.mode = $scope.car.media.mode === 'music' ? 'radio' : 'music';
						
						$scope.car.media.playList = $scope.car.media[$scope.car.media.mode];
						$scope.car.media.channel = 0;
						console.log($scope.car.media.playList);
						audioElement.src = $scope.car.media.playList[$scope.car.media.channel];
						audioElement.play();

						console.log('load: ' + $scope.car.media.playList[$scope.car.media.channel]);
						console.log('media $scope.mode: ' + $scope.car.media.mode);
					}

					if($scope.mode === 'phone' && $scope.car.phone.status === 'calling in'){
						if(swipeDirection === 'left'){
							$scope.car.phone.answer();
						}
						if(swipeDirection === 'right'){
							$scope.car.phone.decline();
						}
					}

					if($scope.mode === 'phone' && $scope.car.phone.status === 'online' && swipeDirection === 'right'){
						$scope.enterMode('media');
					}

					if(swipeDirection === 'left' && $scope.mode === 'media'){
						-- $scope.car.media.channel;
						
						if($scope.car.media.channel < 0){
							$scope.car.media.channel = $scope.car.media.playList.length - 1;
						}

						audioElement.src = $scope.car.media.playList[$scope.car.media.channel];
						audioElement.play();

						console.log('load: ' + $scope.car.media.playList[$scope.car.media.channel]);
					}

					if(swipeDirection === 'right' && $scope.mode === 'media'){

						++ $scope.car.media.channel;
						
						if($scope.car.media.channel > $scope.car.media.playList.length - 1){
							$scope.car.media.channel = 0;
						}

						audioElement.src = $scope.car.media.playList[$scope.car.media.channel];
						audioElement.play();

						console.log('load: ' + $scope.car.media.playList[$scope.car.media.channel]);
					}

					if(swipeDirection === 'in' && $scope.mode === 'window'){
						$scope.car.stopWindow(4) || $scope.car.closeWindow(4);
						console.log('close top window');
					}

					if(swipeDirection === 'out' && $scope.mode === 'window'){
						$scope.car.stopWindow(4) || $scope.car.openWindow(4);
						console.log('open top window');
					}

				}
			});
		}

	});

	controller.connect();
});
