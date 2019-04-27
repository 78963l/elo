const fs = require("fs")
const proc = require("child_process")
const user = require("./user.js")
const site = require("./site.js")
const { remote } = require("electron")
const { Menu, MenuItem } = remote

let projectRoot = ""
let pinnedProject = {}
let pinnedShot = {}

// init은 elo를 초기화 한다.
// 실행은 모든 함수가 정의되고 난 마지막에 하게 된다.
function init() {
    site.init()

    ensureDirExist(configDir())
    loadPinnedProject()
    loadPinnedShot()

    ensureElementExist("project-box")
    ensureElementExist("shot-box")
    ensureElementExist("task-box")
    ensureElementExist("element-box")
    ensureElementExist("mytask-menu")

    addMytaskMenuItems()
    loadMyTask()

    reloadProjects()
    loadSelected()

    window.addEventListener("contextmenu", function(ev) {
        ev.preventDefault()
        function parentById(ev, id) {
            for (let p of ev.path) {
                if (p.id == id) {
                    return p
                }
            }
            return null
        }
        function parentByClassName(ev, cls) {
            for (let p of ev.path) {
                if (p.classList.contains(cls)) {
                    return p
                }
            }
            return null
        }
        if (parentById(ev, "project-box")) {
            let prj = parentByClassName(ev, "item").id.split("-")[1]
            let projectMenu = new Menu()
            let pinProjectMenuItem = new MenuItem({
                label: "상단에 고정",
                click: function() {
                    try {
                        pinProject(prj)
                        reloadProjects()
                    } catch(err) {
                        console.log(err)
                        notify(err.message)
                    }
                },
            })
            let unpinProjectMenuItem = new MenuItem({
                label: "상단에서 제거",
                click: function() {
                    try {
                        unpinProject(prj)
                        reloadProjects()
                    } catch(err) {
                        console.log(err)
                        notify(err.message)
                    }
                },
            })
            if (pinnedProject[prj]) {
                projectMenu.append(unpinProjectMenuItem)
            } else {
                projectMenu.append(pinProjectMenuItem)
            }
            projectMenu.popup(remote.getCurrentWindow())
            return
        }
        if (parentById(ev, "shot-box")) {
            let prj = currentProject()
            let shot = parentByClassName(ev, "item").id.split("-")[1]
            let shotMenu = new Menu()
            let pinShotMenuItem = new MenuItem({
                label: "상단에 고정",
                click: function() {
                    try {
                        pinShot(prj, shot)
                        reloadShots()
                    } catch(err) {
                        console.log(err)
                        notify(err.message)
                    }
                },
            })
            let unpinShotMenuItem = new MenuItem({
                label: "상단에서 제거",
                click: function() {
                    try {
                        unpinShot(prj, shot)
                        reloadShots()
                    } catch(err) {
                        console.log(err)
                        notify(err.message)
                    }
                },
            })
            if (pinnedShot[prj] && pinnedShot[prj][shot]) {
                shotMenu.append(unpinShotMenuItem)
            } else {
                shotMenu.append(pinShotMenuItem)
            }
            shotMenu.popup(remote.getCurrentWindow())
            return
        }
    })
}

// ensureElementExist는 해당 HTML 엘리먼트가 존재하는지 검사한다.
// 존재하지 않는다면 에러를 낸다.
function ensureElementExist(id) {
    let el = document.getElementById(id)
    if (!el) {
        throw Error(id + "가 존재하지 않습니다.")
    }
}

// openModalEv는 사용자가 항목 추가 버튼을 눌렀을 때 그에 맞는 모달 창을 연다.
// 예외적으로 자동으로 생성할 수 있다고 판단하는 몇 몇의 경우에는 창은 열리지 않고
// 해당 항목을 자동으로 만든다.
exports.openModalEv = function(kind) {
    if (kind == "shot" && !currentProject()) {
        notify("아직 프로젝트를 선택하지 않았습니다.")
        return
    }
    if (kind == "task" && !currentShot()) {
        notify("아직 샷을 선택하지 않았습니다.")
        return
    }
    if (kind == "element" && !currentTask()) {
        let mytask = myTask()
        let prj = currentProject()
        let shot = currentShot()
        if (prj && shot && mytask) {
            try {
                createTask(prj, shot, mytask)
            } catch(err) {
                console.log(err)
                notify(err.message)
            }
            return
        }
        notify("아직 태스크를 선택하지 않았습니다.")
        return
    }
    if (kind == "element" && Object.keys(site.elementsOf(currentProject(), currentShot(), currentTask())).length == 0) {
        try {
            site.createDefaultElements(currentProject(), currentShot(), currentTask())
        } catch(err) {
            console.log(err)
            notify(err.message)
        }
        reloadElements()
        return
    }

    try {
        openModal(kind)
    } catch(err) {
        console.log(err)
        notify(err.message)
    }
}

// openModal은 생성할 항목의 종류에 맞는 모달 창을 연다.
function openModal(kind) {
    let m = document.getElementById("modal")
    m.style.display = "block"
    let input = document.getElementById("modal-input")
    input.value = ""
    let progInput = document.getElementById("modal-prog-input")
    progInput.hidden = true
    if (kind == "element") {
        progInput.hidden = false
        progInput.innerText = ""
        let progs = Array()
        try {
            progs = site.programsOf(currentProject(), currentShot(), currentTask())
        } catch(err) {
            m.style.display = "none"
            throw err
        }
        for (let p in progs) {
            let opt = document.createElement("option")
            opt.text = p
            progInput.add(opt)
        }
    }
    kor = {
        "project": "프로젝트",
        "shot": "샷",
        "task": "태스크",
        "element": "요소",
    }
    input.placeholder = "생성 할 " + kor[kind] + " 이름"
    function createItem() {
        closeModal()
        let name = document.getElementById("modal-input").value
        if (!name) {
            notify("생성할 항목의 이름을 설정하지 않았습니다.")
            return
        }
        if (kind == "project") {
            createProject(name)
        } else if (kind == "shot") {
            createShot(currentProject(), name)
        } else if (kind == "task") {
            createTask(currentProject(), currentShot(), name)
        } else if (kind == "element") {
            let prog = document.getElementById("modal-prog-input").value
            createElement(currentProject(), currentShot(), currentTask(), name, prog)
        }
    }
    input.onkeydown = function(ev) {
        if (ev.key == "Enter") {
            try {
                createItem()
            } catch(err) {
                notify(err.message)
                throw err
            }
        }
    }
    input.focus()
    let apply = document.getElementById("modal-apply")
    apply.onclick = function() {
        try {
            createItem()
        } catch(err) {
            notify(err.message)
            throw err
        }
    }
}

// closeModalEv는 모달 사용중 사용자가 닫음 버튼을 눌렀을 때 모달을 닫는다.
exports.closeModalEv = function() {
    try {
        closeModal()
    } catch(err) {
        console.log(err)
        notify(err.message)
    }
}

// closeModal은 모달을 보이지 않도록 한다.
function closeModal() {
    let m = document.getElementById("modal")
    m.style.display = "none"
}

// notify는 아래쪽 표시줄에 text를 표시한다.
function notify(text) {
    let notifier = document.getElementById("notifier")
    notifier.innerText = text
}

// clearNotify는 아래쪽 표시줄에 기존에 표시된 내용을 지운다.
function clearNotify() {
    let notifier = document.getElementById("notifier")
    notifier.innerText = ""
}

// myTask는 현재 내 태스크로 설정된 값을 반환한다.
function myTask() {
    let menu = document.getElementById("mytask-menu")
    return menu.value
}

// loadMyTask는 설정 디렉토리에 저장된 내 태스크 값을 불러온다.
function loadMyTask() {
    let menu = document.getElementById("mytask-menu")
    let fname = configDir() + "/mytask.json"
    if (!fs.existsSync(fname)) {
        menu.value = ""
        return
    }
    let data = fs.readFileSync(fname)
    menu.value = data.toString("utf8")
}

// saveMyTask는 내 태스크로 설정된 값을 설정 디렉토리에 저장한다.
function saveMyTask() {
    let menu = document.getElementById("mytask-menu")
    let fname = configDir() + "/mytask.json"
    fs.writeFileSync(fname, menu.value)
}
exports.saveMyTask = saveMyTask

// loadSelected는 파일에서 마지막으로 선택했던 항목들을 다시 불러온다.
function loadSelected() {
    let fname = configDir() + "/selected.json"
    if (!fs.existsSync(fname)) {
        return
    }
    let data = JSON.parse(fs.readFileSync(fname))
    if (!data.project) {
        return
    }
    try {
        selectProject(data.project)
    } catch(err) {
        console.log(err)
        return
    }
    if (!data.shot) {
        return
    }
    try {
        selectShot(data.shot)
    } catch(err) {
        console.log(err)
        return
    }
    if (!data.task) {
        return
    }
    try {
        selectTask(data.task)
    } catch(err) {
        console.log(err)
        return
    }
    if (!data.element) {
        return
    }
    try {
        selectElement(data.element, data.version)
        if (data.version) {
            toggleVersionVisibility(data.element)
        }
    } catch(err) {
        console.log(err)
        return
    }
}

// saveSelected는 현재 선택된 항목들을 파일로 저장한다.
function saveSelected() {
    let data = JSON.stringify({
        "project": currentProject(),
        "shot": currentShot(),
        "task": currentTask(),
        "element": currentElement(),
        "version": currentVersion(),
    })
    let fname = configDir() + "/selected.json"
    fs.writeFileSync(fname, data)
}

// createProject는 하나의 프로젝트를 생성한다.
function createProject(prj) {
    site.createProject(prj)
    reloadProjects()
    selectProject(prj)
}

// createShot은 하나의 샷을 생성한다.
function createShot(prj, shot) {
    site.createShot(prj, shot)
    reloadShots()
    selectShot(shot)
}

// createTask는 하나의 태스크를 생성한다.
function createTask(prj, shot, task) {
    site.createTask(prj, shot, task)
    reloadTasks()
    selectTask(task)
    site.createDefaultElements(prj, shot, task)
    reloadElements()
}

// createElement는 하나의 요소를 생성한다.
function createElement(prj, shot, task, elem, prog) {
    site.createElement(prj, shot, task, elem, prog)
    reloadElements()
    selectElement(elem, "")
}

// addMytaskMenuItems는 사용가능한 태스크들을 내 태스크 메뉴에 추가한다.
function addMytaskMenuItems() {
    let menu = document.getElementById("mytask-menu")
    if (!menu) {
        throw Error("mytask-menu가 없습니다.")
    }
    let opt = document.createElement("option")
    opt.text = "없음"
    opt.value = ""
    menu.add(opt)
    for (let t of site.tasks()) {
        let opt = document.createElement("option")
        opt.text = t
        menu.add(opt)
    }
}

// selectProjectEv는 사용자가 프로젝트를 선택했을 때 그에 맞는 샷 리스트를 보인다.
function selectProjectEv(prj) {
    try {
        selectProject(prj)
        saveSelected()
    } catch(err) {
        console.log(err)
        notify(err.message)
    }
}

// selectProject는 사용자가 프로젝트를 선택했을 때 그에 맞는 샷 리스트를 보인다.
function selectProject(prj) {
    clearNotify()
    clearShots()
    clearTasks()
    clearElements()
    let box = document.getElementById("project-box")
    let item = box.getElementsByClassName("selected")
    if (item.length != 0) {
        item[0].classList.remove("selected")
    }
    let selected = document.getElementById("project-" + prj)
    selected.classList.add("selected")
    reloadShots()
}

// selectShotEv는 사용자가 샷을 선택했을 때 그에 맞는 태스크 리스트를 보인다.
// 추가로 내 태스크가 설정되어 있다면 그 태스크를 자동으로 선택해 준다.
function selectShotEv(shot) {
    try {
        selectShot(shot)
        saveSelected()
    } catch(err) {
        console.log(err)
        notify(err.message)
    }
}

// selectShot은 사용자가 샷을 선택했을 때 그에 맞는 태스크 리스트를 보인다.
// 추가로 내 태스크로 설정된 값이 있다면 그 태스크를 자동으로 선택해 준다.
function selectShot(shot) {
    clearNotify()
    clearTasks()
    clearElements()
    let box = document.getElementById("shot-box")
    let item = box.getElementsByClassName("selected")
    if (item.length != 0) {
        item[0].classList.remove("selected")
    }
    let selected = document.getElementById("shot-" + shot)
    selected.classList.add("selected")
    reloadTasks()

    let task = myTask()
    if (!task) {
        return
    }
    let prj = currentProject()
    if (!site.tasksOf(prj, shot).includes(task)) {
        return
    }
    try {
        selectTask(task)
    } catch(err) {
        console.log(err)
        notify(err.message)
    }
}

// selectTaskEv는 태스크를 선택했을 때 그 안의 요소 리스트를 보인다.
function selectTaskEv(task) {
    try {
        selectTask(task)
        saveSelected()
    } catch(err) {
        console.log(err)
        notify(err.message)
    }
}

// selectTask는 태스크를 선택했을 때 그 안의 요소 리스트를 보인다.
function selectTask(task) {
    clearNotify()
    clearElements()
    let box = document.getElementById("task-box")
    let item = box.getElementsByClassName("selected")
    if (item.length != 0) {
        item[0].classList.remove("selected")
    }
    let selected = document.getElementById("task-" + task)
    selected.classList.add("selected")
    reloadElements()
}

// selectElementEv는 요소를 선택했을 때 그 선택을 표시한다.
function selectElementEv(elem, ver) {
    try {
        selectElement(elem, ver)
        saveSelected()
    } catch(err) {
        console.log(err)
        notify(err.message)
    }
}

// selectElement는 요소를 선택했을 때 그 선택을 표시한다.
function selectElement(elem, ver) {
    clearNotify()
    let box = document.getElementById("element-box")
    let item = box.getElementsByClassName("selected")
    if (item.length != 0) {
        item[0].classList.remove("selected")
    }
    let id = "element-" + elem
    if (ver) {
        id += "-" + ver
    }
    let selected = document.getElementById(id)
    selected.classList.add("selected")
}

// currentProject는 현재 선택된 프로젝트 이름을 반환한다.
function currentProject() {
    return selectedItemValue("project-box")
}

// currentShot은 현재 선택된 샷 이름을 반환한다.
function currentShot() {
    return selectedItemValue("shot-box")
}

// currentTask는 현재 선택된 태스크 이름을 반환한다.
function currentTask() {
    return selectedItemValue("task-box")
}

// currentElement는 현재 선택된 엘리먼트 이름을 반환한다.
function currentElement() {
    let val = selectedItemValue("element-box")
    if (!val) {
        return null
    }
    return val.split("-")[0]
}

// currentVersion은 현재 선택된 버전을 반환한다.
function currentVersion() {
    let val = selectedItemValue("element-box")
    if (!val) {
        return null
    }
    let vals = val.split("-")
    if (vals.length == 1) {
        return ""
    }
    return vals[1]
}

// selectedItemValue는 특정 'item-box' HTML 요소에서 선틱된 값을 반환한다.
function selectedItemValue(boxId) {
    let box = document.getElementById(boxId)
    if (!box) {
        throw Error(boxId + "가 없습니다.")
    }
    let items = box.getElementsByClassName("item")
    if (!items) {
        return null
    }
    for (let item of items) {
        if (item.classList.contains("selected")) {
            return itemValue(item)
        }
    }
    return null
}

// itemValue는 특정 'item' HTML 요소에 저장된 값을 반환한다.
function itemValue(item) {
    return item.dataset.val
}

// reloadProjects는 프로젝트를 다시 부른다.
function reloadProjects() {
    let box = document.getElementById("project-box")
    box.innerText = ""
    let tmpl = document.getElementById("item-tmpl")
    let prjs = site.projects()
    let pinned = []
    let unpinned = []
    for (let prj of prjs) {
        if (pinnedProject[prj]) {
            pinned.push(prj)
        } else {
            unpinned.push(prj)
        }
    }
    prjs = pinned.concat(unpinned)
    for (let prj of prjs) {
        let frag = document.importNode(tmpl.content, true)
        let div = frag.querySelector("div")
        div.id = "project-" + prj
        div.dataset.val = prj
        div.classList.add("pinnable-item")
        div.getElementsByClassName("item-val")[0].textContent = prj
        if (pinned.includes(prj)) {
            div.getElementsByClassName("item-pin")[0].textContent = "*"
        }
        div.addEventListener("click", function() { selectProjectEv(prj) })
        box.append(div)
    }
}

// reloadShots는 해당 프로젝트의 샷을 다시 부른다.
function reloadShots() {
    let prj = currentProject()
    if (!prj) {
        throw Error("선택된 프로젝트가 없습니다.")
    }
    let box = document.getElementById("shot-box")
    box.innerText = ""

    let shots = site.shotsOf(prj)
    let pinned = []
    let unpinned = []
    for (let shot of shots) {
        if (pinnedShot[prj] && pinnedShot[prj][shot]) {
            pinned.push(shot)
        } else {
            unpinned.push(shot)
        }
    }
    shots = pinned.concat(unpinned)
    let tmpl = document.getElementById("item-tmpl")
    for (let shot of shots) {
        let frag = document.importNode(tmpl.content, true)
        let div = frag.querySelector("div")
        div.id = "shot-" + shot
        div.dataset.val = shot
        div.classList.add("pinnable-item")
        div.getElementsByClassName("item-val")[0].textContent = shot
        if (pinned.includes(shot)) {
            div.getElementsByClassName("item-pin")[0].textContent = "*"
        }
        div.addEventListener("click", function() { selectShotEv(shot) })
        box.append(div)
    }
}

// reloadTasks는 해당 샷의 태스크를 다시 부른다.
function reloadTasks() {
    let prj = currentProject()
    if (!prj) {
        throw Error("선택된 프로젝트가 없습니다.")
    }
    let shot = currentShot()
    if (!shot) {
        throw Error("선택된 샷이 없습니다.")
    }
    let box = document.getElementById("task-box")
    box.innerText = ""
    let tmpl = document.getElementById("item-tmpl")
    for (let t of site.tasksOf(prj, shot)) {
        let frag = document.importNode(tmpl.content, true)
        let div = frag.querySelector("div")
        div.id = "task-" + t
        div.dataset.val = t
        div.getElementsByClassName("item-val")[0].textContent = t
        div.addEventListener("click", function() { selectTaskEv(t) })
        box.append(div)
    }
}

// reloadElements는 해당 태스크의 요소를 다시 부른다.
function reloadElements() {
    let prj = currentProject()
    if (!prj) {
        throw Error("선택된 프로젝트가 없습니다.")
    }
    let shot = currentShot()
    if (!shot) {
        throw Error("선택된 샷이 없습니다.")
    }
    let task = currentTask()
    if (!task) {
        throw Error("선택된 태스크가 없습니다.")
    }
    let box = document.getElementById("element-box")
    box.innerText = ""
    let tmpl = document.getElementById("item-tmpl")
    let elems = site.elementsOf(prj, shot, task)
    for (let elem in elems) {
        let e = elems[elem]
        let frag = document.importNode(tmpl.content, true)
        let div = frag.querySelector("div")
        div.id = "element-" + elem
        div.dataset.val = elem
        let lastver = e.versions[e.versions.length - 1]
        div.getElementsByClassName("item-val")[0].textContent = elem
        div.getElementsByClassName("item-pin")[0].textContent = lastver + ", " +  e.program
        div.addEventListener("click", function() { selectElementEv(elem, "") })
        div.addEventListener("dblclick", function() { openVersionEv(prj, shot, task, elem, e.program, lastver) })
        let toggle = document.createElement("div")
        toggle.classList.add("toggle")
        toggle.textContent = "▷"
        toggle.style.width = "1.5em"
        toggle.dataset.hideVersions = "t"
        toggle.addEventListener("click", function(ev) {
            ev.stopPropagation()
            toggleVersionVisibility(elem)
        })
        toggle.addEventListener("dblclick", function(ev) {
            ev.stopPropagation()
        })
        div.insertBefore(toggle, div.firstChild)
        box.append(div)
        for (let ver of e.versions.reverse()) {
            let frag = document.importNode(tmpl.content, true)
            let div = frag.querySelector("div")
            div.classList.add("element-" + elem + "-versions")
            div.id = "element-" + elem + "-" + ver
            div.dataset.val = elem + "-" + ver
            div.getElementsByClassName("item-val")[0].textContent = ver
            div.addEventListener("click", function() { selectElementEv(elem, ver) })
            div.addEventListener("dblclick", function() { openVersionEv(prj, shot, task, elem, e.program, ver) })
            div.style.display = "none"
            box.append(div)
        }
    }
}

// toggleVersionVisibility는 특정 요소의 버전을 보이거나 숨긴다.
function toggleVersionVisibility(elem) {
    let div = document.getElementById("element-" + elem)
    let toggle = div.getElementsByClassName("toggle")[0]
    if (toggle.dataset.hideVersions == "t") {
        toggle.dataset.hideVersions = "f"
    } else {
        toggle.dataset.hideVersions = "t"
    }
    if (toggle.dataset.hideVersions == "t") {
        toggle.textContent = "▷"
    } else {
        toggle.textContent = "▽"
    }
    let vers = document.getElementsByClassName("element-" + elem + "-versions")
    for (let v of vers) {
        if (toggle.dataset.hideVersions == "t") {
            v.style.display = "none"
        } else {
            v.style.display = "flex"
        }
    }
}

// openVersionEv는 해당 요소의 한 버전을 연다.
function openVersionEv(prj, shot, task, elem, prog, ver) {
    let progs = site.programsOf(prj, shot, task, prog)
    let p = progs[prog]
    if (!p) {
        notify(task + " 태스크에 " + prog + " 프로그램 정보가 등록되어 있지 않습니다.")
    }
    let handleError = function(err, stdout, stderr) {
        if (err) {
            if (err.errno == "ENOENT") {
                err = Error(p.name + " 씬을 열기 위한 명령어가 없습니다.")
            }
            console.log(err)
            notify(err.message)
        }
    }
    p.openVersion(prj, shot, task, elem, ver, handleError)
}

// clearBox는 'item-box' HTML 요소 안의 내용을 모두 지운다.
function clearBox(id) {
    let box = document.getElementById(id)
    if (!box) {
        throw Error(id + "가 없습니다.")
    }
    box.innerText = ""
}

// clearShots는 샷 박스의 내용을 지운다.
function clearShots() {
    clearBox("shot-box")
}

// clearTasks는 태스크 박스의 내용을 지운다.
function clearTasks() {
    clearBox("task-box")
}

// clearElements는 요소 박스의 내용을 지운다.
function clearElements() {
    clearBox("element-box")
}

// configDir은 elo의 설정 디렉토리 경로를 반환한다.
function configDir() {
    return user.configDir() + "/elo"
}

// ensureDirExist는 해당 디렉토리가 없을 때 생성한다.
function ensureDirExist(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir)
    }
}

// loadPinnedProject는 사용자가 상단에 고정한 프로젝트를 설정 디렉토리에서 찾아 부른다.
function loadPinnedProject() {
    let fname = configDir() + "/pinned_project.json"
    if (!fs.existsSync(fname)) {
        pinnedProject = {}
        return
    }
    let data = fs.readFileSync(fname)
    pinnedProject = JSON.parse(data)
}

// pinProject는 특정 프로젝트를 상단에 고정한다.
// 변경된 내용은 설정 디렉토리에 저장되어 다시 프로그램을 열 때 반영된다.
function pinProject(prj) {
    pinnedProject[prj] = true
    let fname = configDir() + "/pinned_project.json"
    let data = JSON.stringify(pinnedProject)
    fs.writeFileSync(fname, data)
}

// unpinProject는 특정 프로젝트의 상단 고정을 푼다.
// 변경된 내용은 설정 디렉토리에 저장되어 다시 프로그램을 열 때 반영된다.
function unpinProject(prj) {
    delete pinnedProject[prj]
    let fname = configDir() + "/pinned_project.json"
    let data = JSON.stringify(pinnedProject)
    fs.writeFileSync(fname, data)
}

// loadPinnedShot은 사용자가 상단에 고정한 샷을 설정 디렉토리에서 찾아 부른다.
function loadPinnedShot() {
    let fname = configDir() + "/pinned_shot.json"
    if (!fs.existsSync(fname)) {
        pinnedShot = {}
        return
    }
    let data = fs.readFileSync(fname)
    pinnedShot = JSON.parse(data)
}

// pinShot은 특정 샷을 상단에 고정한다.
// 변경된 내용은 설정 디렉토리에 저장되어 다시 프로그램을 열 때 반영된다.
function pinShot(prj, shot) {
    if (!pinnedShot[prj]) {
        pinnedShot[prj] = {}
    }
    pinnedShot[prj][shot] = true
    let fname = configDir() + "/pinned_shot.json"
    let data = JSON.stringify(pinnedShot)
    fs.writeFileSync(fname, data)
}

// unpinShot은 특정 샷의 상단 고정을 푼다.
// 변경된 내용은 설정 디렉토리에 저장되어 다시 프로그램을 열 때 반영된다.
function unpinShot(prj, shot) {
    delete pinnedShot[prj][shot]
    if (Object.keys(pinnedShot[prj]).length == 0) {
        delete pinnedShot[prj]
    }
    let fname = configDir() + "/pinned_shot.json"
    let data = JSON.stringify(pinnedShot)
    fs.writeFileSync(fname, data)
}

// 초기화 실행
try {
    init()
} catch(err) {
    console.log(err)
    notify(err.message)
}
