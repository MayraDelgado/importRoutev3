(function (global) {
    var extend = function() {
            var args = arguments,
                length = args.length,
                src, srcKeys, srcAttr,
                fullCopy = false,
                resAttr,
                res = args[0], i = 1, j,
                isUsualObject = function (obj) {
                    return Object.prototype.toString.call(obj).indexOf("Object") !== -1;
                };

            if (typeof res === "boolean") {
                fullCopy = res;
                res = args[1];
                i++;
            }
            while (i !== length) {
                src = args[i];
                srcKeys = Object.keys(src);
                for (j = 0; j < srcKeys.length; j++) {
                    srcAttr = src[srcKeys[j]];
                    if (fullCopy && (isUsualObject(srcAttr) || Array.isArray(srcAttr))) {
                        resAttr = res[srcKeys[j]];
                        resAttr = res[srcKeys[j]] = (isUsualObject(resAttr) || Array.isArray(resAttr)) ? resAttr : (Array.isArray(srcAttr) ? [] : {});
                        extend(fullCopy, resAttr, srcAttr);
                    } else {
                        res[srcKeys[j]] = src[srcKeys[j]];
                    }
                }
                i++;
            }
            return res;
        },
        getResolvedPromise = function () {
            return new Promise(function(fakeResolver){ return fakeResolver([]); });
        },
        call = geotab.api.post,
        multiCall = geotab.api.multiCall,
        defaultGroupId = "GroupCompanyId",
        defaultPrivateGroupId = "GroupPrivateUserId",
        AVAILABLE_RECIPIENT_TYPES = [
            "AssignToGroup",
            "BeepTenTimesRapidly",
            "BeepTenTimesRapidlyAllowDelay",
            "BeepThreeTimes",
            "BeepThreeTimesAllowDelay",
            "BeepThreeTimesRapidly",
            "BeepThreeTimesRapidlyAllowDelay",
            "ChangeStatus",
            "Email",
            "LogOnly",
            "LogPopup",
            "LogUrgentPopup",
            "TextMessage",
            "TextToSpeech",
            "TextToSpeechAllowDelay",
            "WebRequest"
        ];

    global.configImporter = function (config, user, server, credentials) {
        var newUser = extend(true, {}, user),
            importedData = {},
            // Remove recipients that are not in allowed recipients list
            filterRecipients = function (distributionLists) {
                distributionLists.forEach(function (listItem) {
                    listItem.recipients = listItem.recipients.filter(function (recipient) {
                        return AVAILABLE_RECIPIENT_TYPES.indexOf(recipient.recipientType) > -1;
                    });
                });
            },
            importConfig = function () {
                var importSequence = [
                    {types: ["groups"], importer: importGroups},
                    {types: ["securityGroups"], importer: importCustomGroups},
                    {types: ["customMaps"], importer: importCustomMaps},
                    {types: ["workHolidays", "workTimes", "zoneTypes", "users"], importer: importGroupsOfEntities},
                    {types: ["diagnostics"], importer: importDiagnostics},
                    {types: ["zones", "devices", "notificationTemplates"], importer: importGroupsOfEntities},
                    {types: ["rules"], importer: importRules},
                    {types: ["distributionLists"], importer: importGroupsOfEntities, filter: filterRecipients},
                    {types: ["reports"], importer: importReports},
                    {types: ["misc"], importer: importMiscSettings}
                ];
                return new Promise(function(resolve, reject) {
                    importSequence.reduce(function(result, levelImportParams) {
                            var dataForImport = levelImportParams.types.map(function(entityType) {
                                levelImportParams.filter && config[entityType] && levelImportParams.filter(config[entityType], entityType);
                                return {type: entityType, data: config[entityType]};
                            });

                            return result.then(function () {
                                return levelImportParams.importer(dataForImport);
                            });
                        }, getResolvedPromise())
                        .then(function () {
                            resolve({
                                importedData: importedData,
                                user: newUser
                            });
                        }).catch(reject);
                });
            },

            importGroups = function (groupsData) {
                var groups = groupsData[0].data,
                    splitGroupsByLevels = function () {
                        var processedIds = [defaultGroupId],
                            levelItems,
                            levelIds,
                            levels = [],
                            parentIds = [defaultGroupId, defaultPrivateGroupId];
                        do {
                            levelItems = findItemsWithParents(parentIds);
                            levelIds = levelItems.map(function (item) {return item.id});
                            levels.push(levelItems);
                            processedIds = processedIds.concat(levelIds);
                            parentIds = levelIds;
                        } while (parentIds.length > 0);
                        return levels;
                    },
                    findItemsWithParents = function (oldParentIds) {
                        return groups.reduce(function (items, group) {
                            group.parent && oldParentIds.indexOf(group.parent.id) > -1 && items.push(group);
                            return items;
                        }, []);
                    },
                    getUserByPrivateGroupId = function (groupId) {
                        var currentUser = config.misc.currentUser,
                            users = config.users,
                            outputUser,
                            userHasPrivateGroup = function (user, groupId) {
                                return user.privateUserGroups.some(function(group) {
                                    if(group.id === groupId) {
                                        return true;
                                    }
                                });
                            };
                        if(userHasPrivateGroup(currentUser, groupId)) {
                            outputUser = newUser;
                        } else {
                            users.some(function(userItem) {
                                if(userHasPrivateGroup(userItem, groupId)) {
                                    outputUser = userItem;
                                    return true;
                                }
                            })
                        }
                        return outputUser;
                    },
                    generateAddGroupRequest = function (group) {
                        var oldId = group.id,
                            oldParentId = group.parent && group.parent.id,
                            privateUser = group.user,
                            newId = importedData.groups[oldId],
                            newParentId = oldParentId && importedData.groups[oldParentId],
                            request,
                            newGroup;
                        if(group.name && !newId && newParentId) {
                            newGroup = extend(true, {}, group);
                            newGroup.id = null;
                            newGroup.children = [];
                            newGroup.parent = { id: newParentId };
                            delete(newGroup.user);
                            if (newParentId === defaultPrivateGroupId) {
                                if(privateUser) {
                                    newGroup = {
                                        name: privateUser.name,
                                        color: {r: 0, g: 0, b: 0, a: 0},
                                        parent: {
                                            id: defaultPrivateGroupId
                                        }
                                    };
                                } else {
                                    return null;
                                }
                            }
                            request = ["Add", {
                                typeName: "Group",
                                entity: newGroup
                            }];
                        }
                        return request;
                    },
                    parseResults = function (levelGroups, results) {
                        results.forEach(function (result, index) {
                            var groupParentId = levelGroups[index].parent.id,
                                groupUser = getUserByPrivateGroupId(levelGroups[index].id);
                            result && (importedData.groups[levelGroups[index].id] = result);
                            groupParentId === defaultPrivateGroupId && groupUser && groupUser.name === newUser.name && newUser.privateUserGroups.push({id: result});
                        })
                    },
                    groupsLevels = splitGroupsByLevels(groups);

                importedData.groups = {};
                importedData.groups[defaultGroupId] = defaultGroupId;
                importedData.groups[defaultPrivateGroupId] = defaultPrivateGroupId;
                return groupsLevels.reduce(function (addPromise, levelGroups, index) {
                    return addPromise.then(function () {
                        var requests;
                        requests = levelGroups.reduce(function (requests, levelGroup) {
                            var addRequest = generateAddGroupRequest(levelGroup);
                            addRequest && requests.push(addRequest);
                            return requests;
                        }, []);
                        if (requests.length) {
                            return multiCall(server, requests, credentials);
                        } else {
                            return [];
                        }
                    }).then(function(previousResult){
                        parseResults(groupsLevels[index], previousResult);
                    });
                }, new Promise(function(fakeResolver){ return fakeResolver([]); }));
            },

            updateGroupsIds = function (object, properties, groupsHash) {
                var updateGroup = function (item) {
                    groupsHash[item.id] && (item.id = groupsHash[item.id]);
                    delete item.children;
                };
                Object.keys(object).forEach(function (property) {
                    var value = object[property];
                    if (properties.indexOf(property) > -1) {
                        Array.isArray(value) ?
                            value.forEach(function (item) { updateGroup(item); }) :
                            (value.id && updateGroup(value));
                    }
                })
            },

            updateZoneTypesIds = function (object, zoneTypesHash) {
                object.zoneTypes.forEach(function (item) {
                    item.id && (item.id = zoneTypesHash[item.id]);
                })
            },

            importCustomMaps = function (customMaps) {
                if(!customMaps || !customMaps.length) {
                    return getResolvedPromise();
                }
                return call(server, "Get", {
                    credentials: credentials,
                    typeName: "SystemSettings"
                }).then(function (result) {
                    var systemSettings = result[0],
                        customMapsData = customMaps[0].data;
                    customMapsData && (systemSettings.customWebMapProviderList = customMapsData);
                    return call(server, "Set", {
                        credentials: credentials,
                        typeName: "SystemSettings",
                        entity: systemSettings
                    });
                })
            },

            importCustomGroups = function (groupsData) {
                var splitGroupsByLevels = function (groups) {
                        var processedIds = [],
                            levelItems,
                            levelIds,
                            levels = [],
                            parentIds;
                        do {
                            levelItems = findItemsWithParents(groups, parentIds);
                            levelIds = levelItems.map(function (item) {return item.id});
                            levels.push(levelItems);
                            processedIds = processedIds.concat(levelIds);
                            parentIds = levelIds;
                        } while (parentIds.length > 0);
                        return levels;
                    },
                    findItemsWithParents = function (groups, oldParentIds) {
                        return groups.reduce(function (items, group) {
                            if(!oldParentIds) {
                                (!group.parent || (group.parent && group.parent.id.indexOf("Group") > -1)) && items.push(group);
                            } else {
                                group.parent && oldParentIds.indexOf(group.parent.id) > -1 && items.push(group);
                            }
                            return items;
                        }, []);
                    },
                    generateAddGroupRequest = function (group, groupType) {
                        var oldId = group.id,
                            oldParentId = group.parent && group.parent.id,
                            newId = importedData[groupType][oldId],
                            newParentId = oldParentId && (importedData[groupType][oldParentId] || oldParentId),
                            request,
                            newGroup;
                        if(group.name && !newId && newParentId) {
                            newGroup = extend(true, {}, group);
                            newGroup.id = null;
                            newGroup.children = [];
                            newGroup.parent = { id: newParentId };
                            request = ["Add", {
                                typeName: "Group",
                                entity: newGroup
                            }];
                        }
                        return request;
                    },
                    parseResults = function (levelGroups, results, groupType) {
                        results.forEach(function (result, index) {
                            result && (importedData[groupType][levelGroups[index].id] = result);
                        })
                    };

                return groupsData.reduce(function (promises, groupTypeData) {
                    var groupType = groupTypeData.type,
                        groups = groupTypeData.data,
                        groupsLevels = splitGroupsByLevels(groups);
                    importedData[groupType] = {};
                    return groupsLevels.reduce(function (addPromise, levelGroups, index) {
                        return addPromise.then(function () {
                            var requests;
                            requests = levelGroups.reduce(function (requests, levelGroup) {
                                var addRequest = generateAddGroupRequest(levelGroup, groupType);
                                addRequest && requests.push(addRequest);
                                return requests;
                            }, []);
                            if (requests.length) {
                                return multiCall(server, requests, credentials);
                            } else {
                                return [];
                            }
                        }).then(function(previousResult){
                            parseResults(groupsLevels[index], previousResult, groupType);
                        });
                    }, promises);
                }, new Promise(function(fakeResolver){ return fakeResolver([]); }));
            },

            importGroupsOfEntities = function (entitiesData) {
                var initialData = [],
                    requests = entitiesData.reduce(function(requests, entityData) {
                        var type = entityData.type,
                            data = entityData.data;
                        initialData = initialData.concat(data);
                        return data ? requests.concat(generateAddRequests(data, type)) : requests;
                    }, []);
                return multiCall(server, requests, credentials).then(function(importedData) {
                    updateImportedData(requests, initialData, importedData);
                }).catch(function (e) {
                    console.error(e);
                    console.log(requests);
                });
            },

            generateAddRequests = function (entities, entityType) {
                return entities && entities.reduce(function (requests, entity) {
                    var method = "Add",
                        entityCopy = extend(true, {}, entity),
                        requestTypeName;
                    switch(entityType) {
                        case "users":
                            requestTypeName = "User";
                            delete(entityCopy.availableDashboardReports);
                            delete(entityCopy.activeDashboardReports);
                            if(entityCopy.name !== newUser.name) {
                                entityCopy.password = "1111111";
                                entityCopy.changePassword = "true";
                            } else {
                                method = "Set";
                                entityCopy = extend(true, entity, newUser);
                                newUser = entityCopy;
                            }
                            updateGroupsIds(entityCopy, ["companyGroups", "driverGroups", "privateUserGroups", "reportGroups"], importedData.groups);
                            updateGroupsIds(entityCopy, ["securityGroups"], importedData.securityGroups);
                            break;
                        case "devices":
                            requestTypeName = "Device";
                            updateGroupsIds(entityCopy, ["groups", "autoGroups"], importedData.groups);
                            entityCopy.workTime.id && (entityCopy.workTime.id = importedData.WorkTime[entityCopy.workTime.id]);
                            break;
                        case "zones":
                            requestTypeName = "Zone";
                            updateZoneTypesIds(entityCopy, importedData.ZoneType);
                            updateGroupsIds(entityCopy, ["groups"], importedData.groups);
                            break;
                        case "zoneTypes":
                            requestTypeName = "ZoneType";
                            break;
                        case "workTimes":
                            requestTypeName = "WorkTime";
                            !entityCopy.name && (method = "Set");
                            entityCopy.details && entityCopy.details.forEach(function(detail) {detail.id && delete(detail.id)});
                            break;
                        case "workHolidays":
                            requestTypeName = "WorkHoliday";
                            break;
                        case "notificationTemplates":
                            requestTypeName = "NotificationBinaryFile";
                            delete(entityCopy.id);
                            break;
                        case "distributionLists":
                            requestTypeName = "DistributionList";
                            entityCopy.recipients && entityCopy.recipients.forEach(function (recipient) {
                                recipient.user && recipient.user.id && (recipient.user.id = importedData.User[recipient.user.id]);
                                recipient.notificationBinaryFile && recipient.notificationBinaryFile.id &&
                                (recipient.notificationBinaryFile = {id: importedData.NotificationBinaryFile[recipient.notificationBinaryFile.id] || recipient.notificationBinaryFile.id});
                                updateGroupsIds(recipient, ["group"], importedData.groups);
                                recipient.id && delete(recipient.id);
                            });
                            entityCopy.rules && entityCopy.rules.forEach(function(rule) {
                                rule.id && importedData.rules[rule.id] && (rule.id = importedData.rules[rule.id]);
                            });
                            break;
                    }
                    method === "Add" && delete(entityCopy.id);
                    requests.push([method, {
                        typeName: requestTypeName,
                        entity: entityCopy
                    }]);
                    return requests;
                }, []);
            },

            importDiagnostics = function (diagnosticsData) {
                var diagnostics = diagnosticsData[0].data,
                    requests = diagnostics.reduce(function(requests, diagnostic) {
                        requests.push([
                            "Get", {
                                typeName: "Diagnostic",
                                search: {
                                    id: diagnostic.id
                                }
                            }]);
                        return requests;
                    }, []);
                return multiCall(server, requests, credentials).then(function(importedData) {
                    updateImportedData(requests, diagnostics, importedData, null, function(importedItem) {
                        return importedItem && importedItem.length && importedItem[0].id;
                    });
                }).catch(function (e) {
                    console.error(e);
                    console.log(requests);
                });
            },

            importRules = function (rulesData) {
                var rules = rulesData[0].data,
                    removeExistedRules = function () {
                        return call(server, "Get", {
                            credentials: credentials,
                            typeName: "Rule",
                            search: {
                                baseType: "Custom"
                            }
                        }).then(function (result) {
                            var requests = result.reduce(function (res, rule) {
                                res.push(["Remove", {
                                    typeName: "Rule",
                                    entity: {
                                        id: rule.id
                                    }
                                }]);
                                return res;
                            }, []);
                            return multiCall(server, requests, credentials);
                        })
                    },
                    updateDependencies = function (rules) {
                        var updateConditionsData = function(condition) {
                                delete(condition.id);
                                delete(condition.sequence);
                                switch (condition.conditionType) {
                                    case "RuleWorkHours":
                                    case "AfterRuleWorkHours":
                                        condition.workTime && condition.workTime.id && (condition.workTime.id = importedData.WorkTime[condition.workTime.id]);
                                        break;
                                    case "Driver":
                                        condition.driver && condition.driver.id && (condition.driver.id = importedData.User[condition.driver.id]);
                                        break;
                                    case "Device":
                                        condition.device && condition.device.id && (condition.device.id = importedData.Device[condition.device.id]);
                                        break;
                                    case "EnteringArea":
                                    case "ExitingArea":
                                    case "OutsideArea":
                                    case "InsideArea":
                                        condition.zone ? (condition.zone.id && importedData.Zone[condition.zone.id] && (condition.zone.id = importedData.Zone[condition.zone.id])) :
                                            (condition.zoneType.id && importedData.ZoneType[condition.zoneType.id] && (condition.zoneType.id = importedData.ZoneType[condition.zoneType.id]));
                                        break;
                                    case "FilterStatusDataByDiagnostic":
                                    case "ActiveOrInactiveFault":
                                    case "Fault":
                                        if (condition.diagnostic && condition.diagnostic.id && !importedData.Diagnostic[condition.diagnostic.id]) {
                                            return false;
                                        }
                                        break;
                                }
                                return true;
                            },
                            checkConditions = function (parentCondition) {
                                var children;
                                if (!updateConditionsData(parentCondition)) {
                                    return false;
                                }
                                children = parentCondition.children || [];
                                return children.every(function (condition) {
                                    if (condition.children) {
                                        return checkConditions(condition);
                                    }
                                    if (!updateConditionsData(condition)) {
                                        return false;
                                    }
                                    return true;
                                }, true);
                            };
                        return rules.reduce(function (rulesForImport, rule) {
                            updateGroupsIds(rule, "groups", importedData.groups);
                            checkConditions(rule.condition) && rulesForImport.push(rule);
                            return rulesForImport;
                        }, []);
                    },
                    getStockRuleParams = function(rule) {
                        var parseDurationInMinutes = function() {
                                if (!rule.condition || !rule.condition.conditionType || rule.condition.conditionType !== "DurationLongerThan") {
                                    if (rule && rule.condition && rule.condition.conditionType === "And") {
                                        for (var idx in rule.condition.children) {
                                            var child = rule.condition.children[idx];
                                            if (child.conditionType === "DurationLongerThan") {
                                                return parseFloat(child.value / 60);
                                            }
                                        }
                                    }
                                    return 20;
                                }
                                return parseFloat(rule.condition.value / 60);
                            },
                            parseMaxValue = function() {
                                if (!rule.condition || !rule.condition.conditionType || rule.condition.conditionType !== "IsValueLessThan") {
                                    return null;
                                }
                                return parseFloat(rule.condition.value);
                            },
                            parseMinValue = function() {
                                if (!rule.condition || !rule.condition.conditionType || rule.condition.conditionType !== "IsValueMoreThan") {
                                    return null;
                                }
                                return parseFloat(rule.condition.value);
                            },
                            parseMinValueOfChildRule = function() {
                                if (!rule.condition || !rule.condition.children.length|| !rule.condition.children[0].conditionType || rule.condition.children[0].conditionType !== "IsValueMoreThan") {
                                    return null;
                                }
                                return parseFloat(rule.condition.children[0].value);
                            },
                            parseReverseAtTripStartDistanceValue = function() {
                                if (!rule.condition || rule.condition.conditionType !== "DistanceLongerThan" || !rule.condition.children) {
                                    return null;
                                }
                                var children = rule.condition.children;
                                if (!children[0] || children[0].conditionType !== "And" || !children[0].children) {
                                    return null;
                                }
                                for (var i = 0; i < children[0].children.length; i++) {
                                    var c = children[0].children[i];
                                    if (c.children && c.children[0] && c.children[0].conditionType === "TripDistance") {
                                        return parseFloat(c.value);
                                    }
                                }
                                return null;
                            },
                            parseFleetIdlingZone = function() {
                                if (rule && rule.condition && rule.condition.children && rule.condition.children[0] && rule.condition.children[0].children) {
                                    for (var i = 0; i < rule.condition.children[0].children.length; i++) {
                                        var condition = rule.condition.children[0].children[i];
                                        if (condition.conditionType === "InsideArea" && condition.zoneType === "ZoneTypeOfficeId") {
                                            return true;
                                        }
                                    }
                                }
                                return false;
                            },
                            stockRuleType = rule.id,
                            params = [];

                        switch (stockRuleType) {
                            case "RuleHarshBrakingId":
                                params = [parseMaxValue()];
                                break;
                            case "RuleJackrabbitStartsId":
                                params = [parseMinValue()];
                                break;
                            case "RuleHarshCorneringId":
                                var value;
                                if (rule.condition && rule.condition.children && rule.condition.children[0]) {
                                    value = rule.condition.children[0].value;
                                }
                                params = [value];
                                break;
                            case "RulePostedSpeedingId":
                                params = [parseMinValueOfChildRule()];
                                break;
                            case "RuleReverseAtStartId":
                                params = [parseReverseAtTripStartDistanceValue() || 20];
                                break;
                            case "RuleIdlingId":
                            case "RuleAtOfficeLongerThanId":
                            case "RuleLongLunchId":
                            case "RuleLongStopsDuringWorkHoursId":
                                params = [parseDurationInMinutes()];
                                break;
                            case "RuleFleetIdlingId":
                                params = [parseDurationInMinutes(), parseFleetIdlingZone()];
                                break;
                        }
                        return params;
                    },
                    customTypeGetter = function () {
                        return "rules";
                    },
                    customIdGetter = function (result, oldId) {
                        return result.id || oldId;
                    },
                    requests;
                rules = updateDependencies(rules);
                requests = rules.reduce(function (requests, rule) {
                    var ruleCopy;
                    if(rule.baseType === "Stock") {
                        requests.push(["SetStockExceptionRule", {
                            stockRuleDefinition: {
                                id: rule.id,
                                param: getStockRuleParams(rule)
                            }
                        }]);
                    } else {
                        ruleCopy = extend(true, {}, rule);
                        delete(ruleCopy.id);
                        delete(ruleCopy.version);
                        requests.push(["SetExceptionRuleWithConditions", {
                            newRule: ruleCopy,
                            oldRule: null
                        }]);
                    }
                    return requests;
                }, []);
                return removeExistedRules().then(function () {
                    return multiCall(server, requests, credentials);
                }).then(function(importedRules) {
                    updateImportedData(requests, rules, importedRules, customTypeGetter, customIdGetter);
                }).catch(function (e) {
                    console.error(e);
                    console.log(requests);
                });
            },

            updateImportedData = function(requests, initialData, newData, customTypeGetter, customIdGetter) {
                requests.forEach(function (request, index) {
                    var oldId = initialData[index].id,
                        newId = customIdGetter ? customIdGetter(newData[index], oldId) : (newData[index] || oldId),
                        type = customTypeGetter ? customTypeGetter(request) : request[1].typeName;
                    if(!importedData[type]) {
                        importedData[type] = {};
                    }
                    importedData[type][oldId] = newId;
                });
            },

            importReports = function (reportsData) {
                var reports = reportsData[0].data,
                    importTemplatesAndGetReports = function (templates) {
                        var requests = templates.reduce(function (requests, template) {
                            var templateCopy = extend(true, {}, template);
                            if (!template.isSystem) {
                                delete templateCopy.id;
                                delete templateCopy.reports;
                                requests.push(["Add", {
                                    typeName: "ReportTemplate",
                                    entity: templateCopy
                                }]);
                            } else {
                                delete templateCopy.binaryData;
                                requests.push(["Set", {
                                    typeName: "ReportTemplate",
                                    entity: templateCopy
                                }]);
                            }
                            return requests;
                        }, [["GetReportSchedules", {
                            "includeTemplateDetails": true,
                            "applyUserFilter": false
                        }]]);
                        return multiCall(server, requests, credentials).then(function(data) {
                            updateImportedData(requests.slice(1), templates, data.slice(1), function () { return "templates" });
                            return data;
                        });
                    },
                    getReportsForImport = function (templates, importedTemplates) {
                        return templates.reduce(function (reports, template, templateIndex) {
                            var templateReports = template.reports,
                                newTemplateId = importedTemplates[templateIndex] || template.id;
                            return templateReports.reduce(function (templateReports, report) {
                                var reportCopy = extend(true, {}, report);
                                reportCopy.template = {id: newTemplateId};
                                reportCopy.lastModifiedUser = {id: user.id};
                                reportCopy.id = null;
                                updateGroupsIds(reportCopy, ["groups", "includeAllChildrenGroups", "includeDirectChildrenOnlyGroups", "scopeGroups"], importedData.groups);
                                updateReportDevices(reportCopy);
                                updateReportRules(reportCopy);
                                templateReports.push(reportCopy);
                                return templateReports;
                            }, reports);
                        }, []);
                    },
                    updateReportDevices = function (report) {
                        if (!report.arguments || !report.arguments.devices) {
                            return;
                        }
                        report.arguments.devices.forEach(function(device) {
                            var id = device && device.id;
                            id && importedData.devices[id] && (device.id = importedData.devices[id]);
                        })
                    },
                    updateReportRules = function (report) {
                        if (!report.arguments || !report.arguments.rules) {
                            return;
                        }
                        report.arguments.rules.forEach(function(rule) {
                            var id = rule && rule.id;
                            id && importedData.rules[id] && (rule.id = importedData.rules[id]);
                        })
                    },
                    importReports = function (reports, existedReports) {
                        var reportsForUpdate = [],
                            getReportForImport = function (report) {
                                var templateId = report.template.id,
                                    destination = report.destination,
                                    existedReportData,
                                    method = "Add";
                                existedReports.some(function (existedReport) {
                                    var existedTemplateId = existedReport.template.id,
                                        existedDestination = existedReport.destination;
                                    if (existedTemplateId === templateId && existedDestination === destination) {
                                        existedReportData = existedReport;
                                        return true;
                                    }
                                });
                                if (existedReportData) {
                                    method = "Set";
                                    report.id = existedReportData.id;
                                    reportsForUpdate.push(existedReportData.id);
                                }
                                return {
                                    method: method,
                                    report: report
                                }
                            },
                            requests = reports.reduce(function (requests, report) {
                                var requestData = getReportForImport(report);
                                requests.push([requestData.method, {
                                    typeName: "CustomReportSchedule",
                                    entity: requestData.report
                                }]);
                                return requests;
                            }, []);
                        existedReports.reduce(function (requests, existedReport) {
                            reportsForUpdate.indexOf(existedReport.id) === -1 && requests.push([
                                "Remove", {
                                    typeName: "CustomReportSchedule",
                                    entity: existedReport
                                }
                            ]);
                            return requests;
                        }, requests);
                        return multiCall(server, requests, credentials);
                    };
                importedData.reports = {};
                return importTemplatesAndGetReports(reports).then(function () {
                    var existedReports = arguments[0][0],
                        importedTemplates = [].slice.call(arguments[0], 1),
                        reportsForImport = getReportsForImport(reports, importedTemplates);
                    return importReports(reportsForImport, existedReports);
                });
            },

            importMiscSettings = function (miscData) {
                var miscData = miscData[0].data,
                    providerData = miscData.mapProvider,
                    updateUserTemplates = function (user, exportedUser, importedTemplatesData) {
                        Object.keys(importedTemplatesData).forEach(function (oldId) {
                            var newId = importedTemplatesData[oldId],
                                availIndex = exportedUser.availableDashboardReports.indexOf(oldId),
                                activeIndex = exportedUser.activeDashboardReports.indexOf(oldId);
                            availIndex > -1 && (exportedUser.availableDashboardReports[availIndex] = newId);
                            activeIndex > -1 && (exportedUser.activeDashboardReports[activeIndex] = newId);
                        });
                        user.availableDashboardReports = exportedUser.availableDashboardReports;
                        user.activeDashboardReports = exportedUser.activeDashboardReports;
                    };
                newUser.defaultMapEngine = providerData.value;
                updateUserTemplates(newUser, miscData.currentUser, importedData.templates);
                return call(server, "Get", {
                    credentials: credentials,
                    typeName: "SystemSettings"
                }).then(function (result) {
                    var systemSettings = result[0];
                    providerData.type === "additional" && (systemSettings.mapProvider = providerData.value);
                    miscData.isUnsignedAddinsAllowed && (systemSettings.allowUnsignedAddIn = miscData.isUnsignedAddinsAllowed);
                    miscData.addins && (systemSettings.customerPages = miscData.addins);

                    return call(server, "Set", {
                        credentials: credentials,
                        typeName: "SystemSettings",
                        entity: systemSettings
                    });
                });
            };

        return {
            import: importConfig
        }
    }
})(window);
