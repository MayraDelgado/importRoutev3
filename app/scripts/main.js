// jshint devel:true
document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  var CONFIG = {
      // This is the host will post to to create the database. This should be the root server in the federation.
      defaultHost: "my1.geotab.com",
      debug: false,
      // Local debug config (you must create DB and admin user manually)
      debugDBConfig: {
        host: "127.0.0.1",
        db: "temp", // loacal DB name
        user: "qwe@qwe.qwe", // DB admin user
        password: "qweqwe" // DB admin user password
      },
      allowedSecurityRules: [ // If not empty array then Restricted Admin user will be created with permission provided
        //"AboutCheckmate",
        //"DeviceAdmin",
        //"DeviceAdminAdvanced",
        //"DeviceList",
        //"DisplayMap",
        //"NotificationList",
        //"TripsActivityReport",
        //"UserSettings"
      ]
    },
    host = CONFIG.defaultHost,

    // local - helps create local options based on selected time zone. See app/scripts/local.js.
    local = geotab.local,
    // call - helps make calls to MyGeotab API
    call = geotab.api.post,

    // DOM Elements
    elError = document.querySelector("#error"),
    elErrorContent = document.querySelector("#error > span"),
    elErrorClose = document.querySelector("#error-close"),
    elLoading = document.querySelector("#loading"),
    elWaiting = document.querySelector("#waiting"),

    elCompanyName = document.querySelector("#companyName"),
    elRegistrationServerText = document.querySelector("#registrationServer"),
    elDatabaseNameText = document.querySelector("#databaseNameText"),
    elDatabaseName = document.querySelector("#databaseName"),
    elPhoneNumber = document.querySelector("#phoneNumber"),
    elFleetSize = document.querySelector("#fleetSize"),
    elTimeZone = document.querySelector("#timeZone"),

    elFirstName = document.querySelector("#firstName"),
    elLastName = document.querySelector("#lastName"),
    elEmail = document.querySelector("#email"),
    elPassword = document.querySelector("#password"),
    elConfirmPassword = document.querySelector("#confirmPassword"),
    elUpdates = document.querySelector("#updates"),
    elCaptchaImage = document.querySelector("#captchaImage"),
    elCaptchaAnswer = document.querySelector("#captchaAnswer"),
    elImportFile = document.querySelector("#importFile"),

    elSubmit = document.querySelector("#submit"),

    elRequiredInputs = document.querySelectorAll("input[required]"),

    // Dom helpers
    /**
     * Validation states
     * @type {{none: string, success: string, warning: string, error: string}}
     */
    validationState = {
      none: "",
      success: "has-success",
      warning: "has-warning",
      error: "has-error"
    },

    importedConfigFile,

    /**
     * Change the validation state of a for input
     * @param el - The element
     * @param state - The validation state
     */
    changeValidationState = function (el, state) {
      Object.keys(validationState).forEach(function (key) {
        if (validationState[key]) {
          el.classList.remove(validationState[key]);
        }
      });
      if (state) {
        el.classList.add(state);
      }
    },

    // Loading
    /**
     * Show loading spinner (locks UI)
     */
    showLoading = function () {
      elLoading.style.display = "block";
    },

    /**
     * Hide loading spinner
     */
    hideLoading = function () {
      elLoading.style.display = "none";
    },

    // Errors
    /**
     * Show error message
     * @param err - The error object
     */
    showError = function (err) {
      var errorString = "Error";
      if (err && (err.name || err.message)) {
        errorString = (err.name ? err.name + ": " : "") + (err.message || "");
      }
      elErrorContent.textContent = errorString;
      elError.style.display = "block";
    },

    /**
     * Hide error message
     */
    hideError = function () {
      elError.style.display = "none";
    },

    /**
     * Create a short database name from a company name
     * @param companyName {string} - the name of the company
     * @returns {string} - the short database name
     */
    createDatabaseNameFromCompany = function (companyName) {
      var underscore_char = 95,
        companyNameCharacters = new Array(),
        i = 0,
        num, num1, num2, c, charStr,
        chrArray = companyName.split("").map(function (c) {
          return c.charCodeAt(0);
        }),
        length = chrArray.length;

      for (num = 0; num < length; num++) {
        c = chrArray[num];
        charStr = String.fromCharCode(c);
        if (/\w|\d/.test(charStr) && (c !== underscore_char || companyNameCharacters[i - 1] !== underscore_char)) {
          num1 = i;
          i++;
          companyNameCharacters[num1] = c;
        } else if (i > 0 && companyNameCharacters[i - 1] !== underscore_char) {
          num2 = i;
          i++;
          companyNameCharacters[num2] = underscore_char;
        }
      }

      return String.fromCharCode.apply(this, companyNameCharacters);
    },

    // So we can clear the timeout if user is still typing
    checkAvailabilityTimeout,

    /**
     * Check to see if the database name exists
     * @param databaseName {string} - the database name
     */
    checkAvailability = function (databaseName) {
      elDatabaseNameText.parentNode.querySelector(".help-block").style.display = "none";
      changeValidationState(elDatabaseNameText.parentNode, validationState.none);
      if (!databaseName) {
        elWaiting.style.display = "none";
        return;
      }
      elWaiting.style.display = "block";
      if (checkAvailabilityTimeout) {
        clearTimeout(checkAvailabilityTimeout);
      }
      checkAvailabilityTimeout = setTimeout(function () {
        call(host, "DatabaseExists", {
            database: databaseName
          })
          .then(function (result) {
            changeValidationState(elDatabaseNameText.parentNode, result ? validationState.error : validationState.success);
            elDatabaseNameText.parentNode.querySelector(".help-block").style.display = result ? "block" : "none";
            elWaiting.style.display = "none";
          }, function (err) {
            elWaiting.style.display = "none";
            changeValidationState(elRegistrationServerText.parentNode, validationState.error);
          });
      }, 600);
    },

    /**
     * Update the displayed short database name and check if it's availability
     * @param companyName
     */
    updateShortDatabase = function (companyName) {
      var databaseNameText = createDatabaseNameFromCompany(companyName),
        databaseName = databaseNameText.slice(-1) === "_" ? databaseNameText.slice(0, -1) : databaseNameText;
      elDatabaseNameText.value = databaseNameText;
      elDatabaseName.value = databaseName;
      checkAvailability(databaseName);
    },

    // Setup
    /**
     * Get a list of IANA time zones form the server and add to time zone select input
     */
    renderTimeZones = function () {
      call(host, "GetTimeZones")
        .then(function (timeZones) {
          elTimeZone.innerHTML = timeZones
            .sort(function (a, b) {
              var textA = a.id.toLowerCase();
              var textB = b.id.toLowerCase();
              return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
            }).map(function (timeZone) {
              return "<option value=\"" + timeZone.id + "\">" + timeZone.id + "</option>";
            });
        }, showError);
    },

    // store the captcha id in scope so we can use it when we create the database
    captchaId,

    /**
     * Render a new CAPTCHA image with a random captcha id (uuid)
     */
    renderCaptcha = function () {
      captchaId = uuid.v4();
      elCaptchaImage.setAttribute("src", "https://" + host + "/apiv1/GenerateCaptcha?id=" + captchaId);
      elCaptchaAnswer.value = "";
    },

    /**
     * Get the form values from the DOM
     * @returns {{captchaAnswer: {id: *, answer: *}, databaseName: *, userName: *, password: *, companyDetails: {companyName: *, firstName: *, lastName: *, phoneNumber: *, resellerName: string, fleetSize: (Number|number), comments: string, signUpForNews: *}}}
     */
    getFormValues = function () {
      return {
        captchaAnswer: {
          id: captchaId,
          answer: elCaptchaAnswer.value
        },
        database: elDatabaseName.value,
        userName: elEmail.value,
        password: elPassword.value,
        companyDetails: {
          companyName: elCompanyName.value,
          firstName: elFirstName.value,
          lastName: elLastName.value,
          phoneNumber: elPhoneNumber.value,
          resellerName: "ABC Fleets",
          fleetSize: parseInt(elFleetSize.value, 10) || 0,
          comments: "",
          signUpForNews: elUpdates.checked
        }
      };
    },

    // Validation
    /**
     * Validate an email address
     * @param email {string} - the email address
     * @returns {boolean} - is the email address vailid
     */
    isValidEmail = function (email) {
      var re = /^([\w-]+(?:\.[\w-]+)*)@((?:[\w-]+\.)*\w[\w-]{0,66})\.([a-z]{2,6}(?:\.[a-z]{2})?)$/i;
      return re.test(email);
    },

    validatePasswordTimeout,
    /**
     * Validate the entered password
     */
    validatePassword = function () {
      if (validatePasswordTimeout) {
        clearTimeout(validatePasswordTimeout);
      }
      validatePasswordTimeout = setTimeout(function () {
        var isValid = elPassword.value === elConfirmPassword.value;
        var elParent = elConfirmPassword.parentNode;
        changeValidationState(elParent, isValid ? validationState.success : validationState.error);
        elParent.querySelector(".help-block").style.display = isValid ? "none" : "block";
      }, 600);
    },

    /**
     * Validate form values
     * @param values {object} - the for values as retrieved by getFormValues
     * @returns {boolean}
     */
    isFormValid = function (values) {
      var isValid = true;
      if (!values.companyDetails.companyName) {
        isValid = false;
        changeValidationState(elCompanyName.parentNode, validationState.error);
      }
      if (!values.database) {
        isValid = false;
        changeValidationState(elDatabaseNameText.parentNode, validationState.error);
      }
      if (!values.userName || !isValidEmail(values.userName)) {
        isValid = false;
        changeValidationState(elEmail.parentNode, validationState.error);
      }
      if (!values.companyDetails.firstName) {
        isValid = false;
        changeValidationState(elFirstName.parentNode, validationState.error);
      }
      if (!values.companyDetails.lastName) {
        isValid = false;
        changeValidationState(elLastName.parentNode, validationState.error);
      }
      if (!values.password) {
        isValid = false;
        changeValidationState(elPassword.parentNode, validationState.error);
      }
      if (!values.captchaAnswer.answer) {
        isValid = false;
        changeValidationState(elCaptchaAnswer.parentNode, validationState.error);
      }
      return isValid;
    },

    // Registration process
    /**
     * Create a database in the federation
     * @param params {object} - the create database parameters
     * @returns {object} - the database, user and password
     */
    createDatabase = function (params) {
      if (CONFIG.debug) {
        return createDebugDatabase(params);
      }
      var processResult = function (results) {
        var parts = results.split("/");

        return {
          server: parts[0],
          database: parts[1],
          userName: params.userName,
          password: params.password
        };
      };
      return call(host, "CreateDatabase", params).then(processResult);
    },


    createDebugDatabase = function () {
      var processResult = function () {
        return {
          server: CONFIG.debugDBConfig.host,
          database: CONFIG.debugDBConfig.db,
          userName: CONFIG.debugDBConfig.user,
          password: CONFIG.debugDBConfig.password
        };
      };
      return new Promise(function (resolve, reject) {
        if (CONFIG.debugDBConfig) {
          resolve(processResult());
        } else {
          reject("There is no DEBUG_CONFIG");
        }
      });
    },

    /**
     * Authenticate the user against the new database
     * @param options {object}
     * @returns {object} - options with credentials
     */
    authenticate = function (options) {
      return call(options.server, "Authenticate", {
        userName: options.userName,
        password: options.password,
        database: options.database
      }).then(function (results) {
        return {
          server: options.server,
          credentials: results.credentials
        };
      });
    },

    /**
     * Get the administrator user from the new database
     * @param options {object}
     * @returns {object} - options with user
     */
    getUser = function (options) {
      return call(options.server, "Get", {
        credentials: options.credentials,
        typeName: "User",
        search: {
          name: options.credentials.userName
        }
      }).then(function (results) {
        options.user = results[0];
        return options;
      });
    },

    /**
     *  Create clearance
     * @param options {object}
     * @returns {object} - options
     */
    createClearance = function (options) {
      var user = options.user;

      if (!CONFIG.allowedSecurityRules.length) {
        return new Promise(function (resolve) {
          return resolve(options);
        });
      }

      return call(options.server, "Add", {
        credentials: options.credentials,
        typeName: "Group",
        entity: {
          id: null,
          parent: {
            id: "GroupNothingSecurityId"
          },
          name: "Restricted Admin",
          securityFilters: CONFIG.allowedSecurityRules.map(function (permission) {
            return {
              isAdd: true,
              securityIdentifier: permission
            }
          }),
          color: {
            a: 0,
            b: 0,
            g: 0,
            r: 0
          }
        }
      }).then(function (clearenceId) {
        // pass on the options to the next promise
        user.securityGroups = [{
          id: clearenceId,
          color: {
            "r": 0,
            "g": 0,
            "b": 0,
            "a": 255
          }
        }];
        return options;
      });
    },

    /**
     *  Set up the administrator with localized settings based on the selected time zone
     * @param options {object}
     * @returns {object} - options
     */
    setUserDefaults = function (options) {
      var timeZone = elTimeZone.value,
        continent = local.getContinentByTimeZone(timeZone),
        user = options.user;

      user.timeZoneId = timeZone;
      user.isMetric = local.getIsMetricByTimeZone(timeZone);
      user.fuelEconomyUnit = local.getFuelEconomyUnitByTimeZone(timeZone);
      user.dateFormat = local.getDateTimeFormatByTimeZone(timeZone);
      user.mapViews = local.getMapViewsByTimeZone(continent);
      user.firstName = elFirstName.value;
      user.lastName = elLastName.value;
      // Could also set the user's language here (en,fr,es,de,ja): user.language = 'en';

      return call(options.server, "Set", {
        credentials: options.credentials,
        typeName: "User",
        entity: user
      }).then(function () {
        // pass on the options to the next promise
        return options;
      });
    },

    /**
     * Upload config file
     * @param options {object}
     * @returns {object} - options
     */
    uploadConfigFile = function (options) {

      return new Promise(function (resolve, reject) {
        var fileReader = new FileReader(),
          errorHandler = function (evt) {
            reject(evt.target.error);
          };

        if (!importedConfigFile) {
          return resolve(options);
        }

        fileReader.onerror = errorHandler;
        fileReader.onabort = function () {
          throw new Error("File read cancelled");
        };
        fileReader.onload = function (e) {
          var contentString = e.target.result,
            content;
          try {
            content = JSON.parse(contentString);
          } catch (e) {
            reject({
              message: "Invalid imported file's content. File's content can't be converted to a valid JSON object."
            });
          }

          options.importedConfig = content;
          resolve(options);
        };

        fileReader.readAsText(importedConfigFile);
      });
    },

    /**
     *  Import config
     * @param options {object}
     * @returns {object} - options
     */

    importConfig = function (options) {
      var config = options.importedConfig;
      return new Promise(function (resolve, reject) {
        if (!config) {
          return resolve(options);
        }

        configImporter(config, options.user, options.server, options.credentials).import().then(function (importResults) {
          if (importResults) {
            options.user = importResults.user;
            options.importedData = importResults.importedData;
            return call(options.server, "Set", {
              credentials: options.credentials,
              typeName: "User",
              entity: options.user
            });
          }
        }).then(function () {
          resolve(options);
        }).catch(function (error) {
          reject(CONFIG.debug ? error : {
            message: "Can't import configuration"
          });
        });
      });
    },


    /**
     * Send the administrator a success email
     * @param options {object}
     * @returns {*} - send email results (nothing)
     */
    sendSuccessEmail = function (options) {
      var credentials = options.credentials,
        user = options.user,
        welcomeMessage = "Welcome to MyGeotab, you can login to your database via this url: https://" + host + "/" + credentials.database;

      return call(options.server, "SendEmail", {
        credentials: credentials,
        email: user.name,
        subject: "Registration Success",
        body: welcomeMessage,
        bodyHtml: "<p>" + welcomeMessage + "<p>"
      }).then(function () {
        // pass on the options to the next promise
        return options;
      });
    },

    /**
     * Redirect browser to database logged in with credentials
     * @param options {object} - with server and credentials
     */
    redirect = function (options) {
      // use rison to encode token and add to url
     var token = rison.encode_object({
        "token": options.credentials
      });
      //alert("La base de datos :" + options.credentials.database + "  generada exitosamente");
      const toast = swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 7000
      });

      toast({
        type: 'success',
        title: 'La base de datos :' + options.credentials.database + 'generada exitosamente'
      });
      //window.location("https://" + options.server + "/" + options.credentials.database + "#" + token);
      window.open("https://" + options.server + "/" + options.credentials.database + "#" + token);
      hideLoading();
      
    };

  elRegistrationServerText.value = host;

  if (CONFIG.debug) {
    elCompanyName.value = "qqq";
    elDatabaseNameText.value = "qqq";
    elDatabaseName.value = "qqq";
    elPhoneNumber.value = "qqq";
    elFleetSize.value = "qqq";

    elRegistrationServerText.value = CONFIG.debugDBConfig.host;
    elFirstName.value = "qqq";
    elLastName.value = "qqq";
    elEmail.value = "qqq@qqq.com";
    elPassword.value = "qqq";
    elConfirmPassword.value = "qqq";
  }

  // Wire up events
  /**
   * Watch the company name, generate the short database name from it and check it's availability
   */
  elCompanyName.addEventListener("keyup", function () {
    var splitCompanyName = elCompanyName.value.split(/\s+/);
    var databaseName = splitCompanyName.length ? splitCompanyName[0] : "";
    elDatabaseNameText.value = databaseName;
    elDatabaseName.value = databaseName;
    updateShortDatabase(databaseName);
  }, false);

  /**
   * Watch the database name and check it's availability
   */
  elDatabaseNameText.addEventListener("keyup", function () {
    updateShortDatabase(elDatabaseNameText.value);
  });

  elRegistrationServerText.addEventListener("blur", function () {
    host = elRegistrationServerText.value;
    updateShortDatabase(elDatabaseNameText.value);
    renderCaptcha();
  });

  /**
   * Watch the password and check it's validity
   */
  elPassword.addEventListener("keyup", function () {
    if (elConfirmPassword.value) {
      validatePassword();
    }
  });

  /**
   * Watch the password conformation and check it's validity
   */
  elConfirmPassword.addEventListener("keyup", function () {
    if (elConfirmPassword.value) {
      validatePassword();
    }
  });

  elImportFile.addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];

    if (file && file.name && (!importedConfigFile || (importedConfigFile.name !== file.name && importedConfigFile.lastModified !== file.lastModified))) {
      importedConfigFile = file;
    }
  });

  /**
   * Watch required fields and remove field error when no longer empty
   */
  for (var i = 0; i < elRequiredInputs.length; i++) {
    elRequiredInputs[i].addEventListener("keyup", function (evt) {
      if (evt.target.value) {
        changeValidationState(evt.target.parentNode, validationState.none);
      }
    });
  }
 /**.Limpiar campos */
  var refresh1 = function (timeoutperiod) {
    refresh = setTimeout(function () {
      location.reload(true);
    }, timeoutperiod);
  }
  /*end limpiar campos*/
  /**
   * Hide error message on click
   */
  elErrorClose.addEventListener("click", hideError);

  /**
   * Handel form submit
   */
  elSubmit.addEventListener("click", function (evt) {
    var formValues;

    var error = function (error) {
      hideLoading();

      renderCaptcha();
      elSubmit.removeAttribute("disabled");

      showError(error);
      if (error.name === "CaptchaException") {
        elCaptchaAnswer.focus();
      }
    };

    evt.preventDefault();

    elSubmit.setAttribute("disabled", "disabled");

    hideError();
    formValues = getFormValues();

    if (!isFormValid(formValues)) {
      elSubmit.removeAttribute("disabled");
      return;
    }

    showLoading();

    createDatabase(formValues)
      .then(authenticate)
      .then(getUser)
      .then(uploadConfigFile)
      .then(createClearance)
      .then(setUserDefaults)
      .then(importConfig)
      .then(sendSuccessEmail)
      .then(redirect)    
      .then(refresh1)
      .catch(error);
  });

  // Setup the form fields that need to request data from the API
  renderCaptcha();
  renderTimeZones();
});
