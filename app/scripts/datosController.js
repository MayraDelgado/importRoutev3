'use strict'
var angularObj = {
  app: null,
  initAngular: function (api, freshState) {
    angularObj.app = angular.module('myAplicacion', ['ngMaterial', 'md.data.table']);
    angularObj.app.controller('accesoDatosController', ['$scope', function ($scope) {


    }]);
  }
}
