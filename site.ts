import * as fs from "fs"
import * as proc from "child_process"
import * as path from "path"

// siteRoot는 해당 사이트(스튜디오)의 루트 디렉토리를 의미한다.
let siteRoot: string

// showRoot는 해당 사이트(스튜디오)의 쇼(작업) 루트 디렉토리를 의미한다.
// 기본적으로 siteRoot안에 있으나, 따로 정의할 수 있다.
let showRoot: string

// siteInfo는 사이트 루트 디렉토리 안의 site.json에서 불러온 사이트 정보이다.
// 카테고리, 각 항목별 디렉토리 구조 등이 정의되어 있다.
let siteInfo: SiteInfo

// Init은 이 패키지를 사용하기 위한 글로벌 변수 초기화 및 유효성 검사를 수행한다.
export function Init() {
    if (!process.env.SITE_ROOT) {
        throw Error("SITE_ROOT 환경변수가 설정되어 있지 않습니다.")
    }
    siteRoot = path.normalize(process.env.SITE_ROOT)

    if (!process.env.SHOW_ROOT) {
        throw Error("SHOW_ROOT 환경변수가 설정되어 있지 않습니다.")
    }
    showRoot = path.normalize(process.env.SHOW_ROOT)

    let siteFile = path.join(siteRoot, "site.json")
    if (!fs.existsSync(siteFile)) {
        throw Error("$SITE_ROOT에 site.json 파일이 없습니다.")
    }
    let data = fs.readFileSync(siteFile)
    siteInfo = JSON.parse(data.toString("utf8"))
    validateSiteInfo(siteInfo)
}

// ValidCategories는 siteInfo에서 이 사이트에서 사용하는 카테고리명 리스트를 검사해 반환한다.
// 결과는 이름 순으로 정렬된다.
export function ValidCategories(): string[] {
    let ctgs = Object.keys(siteInfo["categories"])
    ctgs.sort()
    return ctgs
}

// CategoryLabel은 siteInfo에서 이 사이트에서 사용하는 카테고리의 영문명에 대응하는 한글명을 반환한다.
export function CategoryLabel(ctg: string): string {
    let ctgInfo = siteInfo["categories"][ctg]
    if (!ctgInfo) {
        throw Error("unknown category: " + ctg)
    }
    return ctgInfo["unit"].Label
}

// ValidParts는 siteInfo에서 이 사이트의 특정 카테고리에서 사용하는 파트명 리스트를 반환한다.
export function ValidParts(ctg: string): string[] {
    let ctgInfo = siteInfo["categories"][ctg]
    if (!ctgInfo) {
        throw Error("unknown category: " + ctg)
    }
    let partInfo = ctgInfo["part"]
    let parts = []
    for (let p in partInfo) {
        parts.push(p)
    }
    parts.sort()
    return parts
}

// ValidPrograms는 siteInfo에서 이 사이트의 특정 카테고리, 파트에서 사용하는 프로그램명 리스트를 반환한다.
export function ValidPrograms(ctg: string, part: string): string[] {
    let ctgInfo = siteInfo["categories"][ctg]
    if (!ctgInfo) {
        throw Error("unknown category: " + ctg)
    }
    let partInfo = ctgInfo["part"]
    if (!partInfo) {
        throw Error("no part information for category '" + ctg + "'")
    }
    let p = partInfo[part]
    if (!p) {
        throw Error("unknown part '" + part + "' for category '" + ctg + "'")
    }
    let names = []
    for (let name in p.ProgramDir) {
        names.push(name)
    }
    names.sort()
    return names
}

interface Branch {
    Parent: Branch | null
    Type: string
    Name: string
    Dir: string
    Subdirs: Dir[]
    ChildRoot: string
}

// CreateShow는 쇼를 하나 생성한다.
export function CreateShow(name: string) {
    let show = new ShowBranch(name)
    for (let d of show.Subdirs) {
        makeDir(path.join(show.Dir, d.Name), d.Perm)
    }
}

// Show는 하나의 쇼 정보를 받아온다.
// 해당 이름의 쇼가 없다면 에러를 낸다.
export function Show(name: string): ShowBranch {
    let show = new ShowBranch(name)
    if (!fs.existsSync(show.Dir)) {
        throw Error("show not exists: " + name)
    }
    return show
}

// Shows는 사이트의 모든 쇼 정보를 받아온다.
export function Shows(): ShowBranch[] {
    let children = []
    for (let d of listDirs(showRoot)) {
        children.push(this.Show(d))
    }
    return children
}

class ShowBranch implements Branch {
    Parent: null
    Type: string
    Name: string
    Dir: string
    Subdirs: Dir[]
    ChildRoot: string

    constructor(name: string) {
        this.Parent = null
        this.Type = "show"
        this.Name = name
        this.Dir = path.join(showRoot, name)
        let showInfo = siteInfo["show"]
        this.Subdirs = showInfo.Subdirs
        this.ChildRoot = path.join(this.Dir, showInfo.ChildRoot)
    }
    Category(name: string): CategoryBranch {
        return new CategoryBranch(this, name)
    }
    Categories(): CategoryBranch[] {
        let children = []
        for (let c of ValidCategories()) {
            children.push(this.Category(c))
        }
        return children
    }
}

class CategoryBranch implements Branch {
    Parent: Branch
    Type: string
    Name: string
    Dir: string
    Subdirs: Dir[]
    ChildRoot: string

    constructor(parent: ShowBranch, name: string) {
        if (!ValidCategories().includes(name)) {
            throw Error("invalid category name: " + name)
        }
        this.Parent = parent
        this.Type = "category"
        this.Name = name
        this.Dir = path.join(parent.ChildRoot, name)
        let ctgInfo = siteInfo["category"]
        this.Subdirs = ctgInfo.Subdirs
        this.ChildRoot = path.join(this.Dir, ctgInfo.ChildRoot)
    }
    CreateGroup(name: string) {
        let group = new GroupBranch(this, name)
        for (let d of group.Subdirs) {
            makeDir(path.join(group.Dir, d.Name), d.Perm)
        }
    }
    Group(name: string): GroupBranch {
        let group = new GroupBranch(this, name)
        if (!fs.existsSync(group.Dir)) {
            throw Error("no group: " + name)
        }
        return group
    }
    Groups(): GroupBranch[] {
        let children = []
        for (let d of listDirs(this.ChildRoot)) {
            children.push(this.Group(d))
        }
        return children
    }
}

class GroupBranch implements Branch {
    Parent: Branch
    Type: string
    Name: string
    Dir: string
    Subdirs: Dir[]
    ChildRoot: string

    constructor(parent: CategoryBranch, name: string) {
        this.Parent = parent
        this.Type = "group"
        this.Name = name
        this.Dir = path.join(parent.ChildRoot, name)
        let ctg = getParent(this, "category").Name
        let ctgInfo = siteInfo["categories"][ctg]
        if (!ctgInfo) {
            throw Error("unknown category: " + ctg)
        }
        let grpInfo = ctgInfo["group"]
        this.Subdirs = grpInfo.Subdirs
        this.ChildRoot = path.join(this.Dir, grpInfo.ChildRoot)
    }
    CreateUnit(name: string) {
        let unit = new UnitBranch(this, name)
        for (let d of unit.Subdirs) {
            makeDir(path.join(unit.Dir, d.Name), d.Perm)
        }
    }
    Unit(name: string): UnitBranch {
        let unit = new UnitBranch(this, name)
        if (!fs.existsSync(unit.Dir)) {
            throw Error("no unit: " + name)
        }
        return unit
    }
    Units(): UnitBranch[] {
        let children = []
        for (let d of listDirs(this.ChildRoot)) {
            children.push(this.Unit(d))
        }
        return children
    }
}

class UnitBranch implements Branch {
    Parent: Branch
    Type: string
    Name: string
    Dir: string
    Subdirs: Dir[]
    ChildRoot: string

    constructor(parent: GroupBranch, name: string) {
        this.Parent = parent
        this.Type = "unit"
        this.Name = name
        this.Dir = path.join(parent.ChildRoot, name)
        let ctg = getParent(this, "category").Name
        let ctgInfo = siteInfo["categories"][ctg]
        if (!ctgInfo) {
            throw Error("unknown category: " + ctg)
        }
        let unitInfo = ctgInfo["unit"]
        this.Subdirs = unitInfo.Subdirs
        this.ChildRoot = path.join(this.Dir, unitInfo.ChildRoot)
    }
    CreatePart(name: string) {
        let part = new PartBranch(this, name)
        for (let d of part.Subdirs) {
            makeDir(path.join(part.Dir, d.Name), d.Perm)
        }
    }
    Part(name: string): PartBranch {
        return new PartBranch(this, name)
    }
    Parts(): PartBranch[] {
        let children = []
        for (let d of listDirs(this.ChildRoot)) {
            let p: PartBranch
            try {
                p = this.Part(d)
            } catch(err) {
                // 알지 못하는 파트가 있더라도 넘어간다.
                continue
            }
            children.push(p)
        }
        return children
    }
}

class PartBranch implements Branch {
    Parent: Branch
    Type: string
    Name: string
    Dir: string
    Subdirs: Dir[]
    ChildRoot: string
    ProgramDir: { [k: string]: string }

    constructor(parent: UnitBranch, name: string) {
        this.Parent = parent
        this.Type = "part"
        this.Name = name
        this.Dir = path.join(parent.ChildRoot, name)
        let ctg = getParent(this, "category").Name
        let ctgInfo = siteInfo["categories"][ctg]
        if (!ctgInfo) {
            throw Error("unknown category: " + ctg)
        }
        let partInfo = ctgInfo["part"][this.Name]
        if (!partInfo) {
            throw Error("unknown part for " + ctg + " category: " + this.Name)
        }
        this.Subdirs = partInfo.Subdirs
        this.ChildRoot = this.Dir
        this.ProgramDir = partInfo.ProgramDir
    }
    Programs(): string[] {
        let progs = []
        for (let prog in this.ProgramDir) {
            progs.push(prog)
        }
        progs.sort()
        return progs
    }
    ProgramAt(prog: string): string {
        if (!(prog in this.ProgramDir)) {
            throw Error("program '" + prog + "' not defined in " + this.Name)
        }
        return this.ProgramDir[prog]
    }
    CreateTask(prog: string, task: string, ver: string) {
        let pg = siteInfo.programs[prog]
        if (!pg) {
            throw Error("program not defined: " + prog)
        }
        let progDir = this.ProgramAt(prog)
        let dir = path.join(this.Dir, progDir)
        if (!fs.existsSync(dir)) {
            for (let i in this.Subdirs) {
                let d = this.Subdirs[i]
                if (d.Name == progDir) {
                    makeDir(dir, d.Perm)
                }
            }
        }
        let t = new TaskBranch(this, task, pg, dir)
        t.Create(ver)
    }
    OpenTask(prog: string, task: string, ver: string, handleError: (err: Error) => void) {
        let t = this.Task(prog, task)
        t.Open(ver, handleError)
    }
    Task(prog: string, task: string): TaskBranch {
        let progTasks = this.Tasks(prog)
        for (let t of progTasks) {
            if (t.Name == task) {
                return t
            }
        }
        throw Error("no task for " + prog + " program: " + task)
    }
    Tasks(prog: string): TaskBranch[] {
        let dir = path.join(this.Dir, this.ProgramAt(prog))
        if (!fs.existsSync(dir)) {
            return []
        }
        let pg = siteInfo.programs[prog]
        if (!pg) {
            throw Error("program not defined: " + prog)
        }
        let show = getParent(this, "show").Name
        let grp = getParent(this, "group").Name
        let unit = getParent(this, "unit").Name
        let part = this.Name
        let taskMap = {}
        let files = fs.readdirSync(dir)
        for (let f of files) {
            if (!fs.lstatSync(path.join(dir, f)).isFile()) {
                continue
            }
            if (!f.endsWith(pg.Ext)) {
                continue
            }
            f = f.substring(0, f.length - pg.Ext.length)
            let prefix = show + "_" + grp + "_" + unit + "_" + part + "_"
            if (!f.startsWith(prefix)) {
                continue
            }
            f = f.substring(prefix.length, f.length)
            let ws = f.split("_")
            if (ws.length == 1) {
                continue
            }
            let version = ws.pop()
            let task = ws.join("_")
            if (!version.startsWith("v") || !parseInt(version.substring(1), 10)) {
                continue
            }
            if (!taskMap[task]) {
                taskMap[task] = new TaskBranch(this, task, pg, dir)
            }
            taskMap[task].Versions.push(version)
        }
        let tasks = []
        for (let k in taskMap) {
            let t = taskMap[k]
            t.Versions.sort()
            tasks.push(t)
        }
        tasks.sort(function(a, b) {
            return compare(a.Name, b.Name)
        })
        return tasks
    }
}

class TaskBranch implements Branch {
    Parent: Branch
    Type: string
    Name: string
    Program: Program
    Dir: string
    Versions: string[]
    // 아래는 브랜치를 구현하기 위해 필요하지만, 쓰이지는 않음.
    Subdirs: Dir[]
    ChildRoot: string

    constructor(parent: PartBranch, name: string, pg: Program, dir: string) {
        this.Parent = parent
        this.Type = "task"
        this.Name = name
        this.Program = pg
        this.Dir = dir
        this.Versions = []
    }
    Create(ver: string) {
        let scene = this.Scene(ver)
        if (fs.existsSync(scene)) {
            throw Error("scene already exists: " + scene)
        }
        let createCmd = this.Program.CreateCmd[process.platform]
        if (!createCmd) {
            throw Error("not supported os: " + process.platform)
        }
        let create = path.join(siteRoot, createCmd)
        proc.execFileSync(create, [scene])
    }
    Open(ver: string, handleError: (err: Error) => void) {
        let scene = this.Scene(ver)
        let openCmd = this.Program.OpenCmd[process.platform]
        if (!openCmd) {
            throw Error("not supported os: " + process.platform)
        }
        let open = path.join(siteRoot, openCmd)
        spawn(open, [scene], { detach: true }, handleError)
    }
    Scene(ver): string {
        if (!ver) {
            ver = this.Versions[this.Versions.length-1]
        }
        let show = getParent(this, "show").Name
        let grp = getParent(this, "group").Name
        let unit = getParent(this, "unit").Name
        let part = getParent(this, "part").Name
        let name = show + "_" + grp + "_" + unit + "_" + part + "_" + this.Name + "_" + ver + this.Program.Ext
        let scene = path.join(this.Dir, name)
        return scene
    }
}

interface Dir {
    Name: string
    Perm: string
}

// createDirs는 부모 디렉토리에 하위 디렉토리들을 생성한다.
// 만일 생성하지 못한다면 에러가 난다.
function makeDir(d: string, perm: string) {
    fs.mkdirSync(d)
    fs.chmodSync(d, perm)
    if (process.platform == "win32") {
        // 윈도우즈에서는 위의 mode 설정이 먹히지 않기 때문에 모두에게 권한을 푼다.
        // 리눅스의 775와 윈도우즈의 everyone은 범위가 다르지만
        // 윈도우즈에서 가장 간단히 권한을 설정할 수 있는 방법이다.
        let specialBit = perm.substring(0, 1)
        let defaultBits = perm.substring(1, 4)
        if (defaultBits == "777" || defaultBits == "775") {
            let user = "everyone:(F)"
            if (specialBit == "2") {
                user = "everyone:(CI)(OI)(F)"
            }
            proc.execFileSync("icacls", [d.replace(/\//g, "\\"), "/grant", user])
        }
    }
}

// listDirs는 특정 디렉토리의 하위 디렉토리들을 검색하여 반환한다.
// 해당 디렉토리가 없거나 검사할 수 없다면 에러가 난다.
function listDirs(d): string[] {
    if (!fs.existsSync(d)) {
        throw Error(d + " 디렉토리가 존재하지 않습니다.")
    }
    let dirs: string[] = []
    for (let ent of fs.readdirSync(d)) {
        let isDir = fs.lstatSync(path.join(d, ent)).isDirectory()
        if (isDir) {
            dirs.push(ent)
        }
    }
    dirs.sort()
    return dirs
}

// cloneEnv는 현재 프로세스의 환경을 복제한 환경을 생성한다.
// 요소를 생성하거나 실행할 때 프로그램에 맞게 환경을 수정할 때 사용한다.
function cloneEnv() {
    let env = {}
    for (let e in process.env) {
        env[e] = process.env[e]
    }
    return env
}

// compare는 두 값을 받아 비교한 후 앞의 값이 더 작으면 -1, 뒤의 값이 더 작으면 1, 같으면 0을 반환한다.
function compare(a, b): number {
    if (a < b) {
        return -1
    } else if (a > b) {
        return 1
    }
    return 0
}

function getParent(b: Branch, type: string): Branch {
    while (b.Parent) {
        b = b.Parent
        if (b.Type == type) {
            return b
        }
    }
    throw Error(name + " branch not found")
}

// mustHaveAttrs는 오브제트에 해당 어트리뷰트가 존재하는지 체크하고 없으면 에러를 낸다.
function mustHaveAttrs(label, obj, attrs) {
    for (let a of attrs) {
        if (!(a in obj)) {
            throw Error(label + ": does not have attribute: " + a)
        }
    }
}

interface BranchInfo {
    Label: string
    Subdirs: Dir[]
    ChildRoot: string
}

interface PartInfo {
    Label: string
    Subdirs: Dir[]
    ProgramDir: { [k: string]: string }
}

// SiteInfo는 설정 파일에 정의되는 사이트 정보이다.
interface SiteInfo {
    show: BranchInfo
    category: BranchInfo
    categories: { [k: string]: { [k: string]: BranchInfo } }
    programs: { [k: string]: Program }
}

// validateSiteInfo는 설정 파일에서 불러온 사이트 정보에 문제가 없는지를
// 체크하고, 문제가 있을 때는 에러를 낸다.
function validateSiteInfo(info: SiteInfo) {
    mustHaveAttrs("siteInfo", info, ["show", "category", "categories", "programs"])
    validateBranchInfo("siteInfo[show]", info.show)
    validateBranchInfo("siteInfo[category]", info.category)
    for (let ctg in info.categories) {
        let label = "siteInfo[categories]["+ctg+"]"
        let ctgInfo = info.categories[ctg]
        mustHaveAttrs(label , ctgInfo, ["group", "unit", "part"])
        validateBranchInfo(label, ctgInfo.group)
        validateBranchInfo(label, ctgInfo.unit)
        for (let p in ctgInfo.part) {
            let l = label + "[part]["+p+"]"
            validatePartInfo(l, ctgInfo.part[p])
        }
    }
    for (let part in info.programs) {
        let label = "siteInfo[programs]["+part+"]"
        validateProgram(label, info.programs[part])
    }
}

function validatePartInfo(label: string, info: PartInfo) {
    mustHaveAttrs(label, info, ["Label", "Subdirs", "ProgramDir"])
}

function validateBranchInfo(label: string, info: BranchInfo) {
    mustHaveAttrs(label, info, ["Label", "Subdirs", "ChildRoot"])
    for (let d of info.Subdirs) {
        validateDir(label, d)
    }
}

// validateDir은 설정 파일에서 불러온 디렉토리 정보에 문제가 없는지를
// 체크하고, 문제가 있을 때는 에러를 낸다.
function validateDir(label: string, d: Dir) {
    mustHaveAttrs(label, d, ["Name", "Perm"])
    if (typeof d.Perm != "string" || d.Perm.length != 4) {
        throw(label + ": elo에서는 파일 디렉토리 권한에 4자리 문자열 만을 사용합니다")
    }
}

interface Program {
    Name: string
    Ext: string
    CreateCmd: string
    OpenCmd: string
}

// validateProgram는 설정 파일에서 불러온 파트 정보에 문제가 없는지를
// 체크하고, 문제가 있을 때는 에러를 낸다.
function validateProgram(label: string, p: Program) {
    mustHaveAttrs(label, p, ["Name", "Ext", "CreateCmd", "OpenCmd"])
}

// spawn은 특정 명령을 elo에서 떼어내어 실행하되, 에러가 발생할 경우
// 그 에러메시지를 처리할 수 있도록 handleError 핸들러를 받는다.
function spawn(cmd: string, args: string[], opts: object, handleError: (err) => void) {
    let p = proc.spawn(cmd, args, opts)
    let stderr = ""
    p.stderr.on("data", (data) => {
        stderr += data
    })
    p.on("exit", (code) => {
        if (code != 0) {
            let err = new Error("exit with error " + code + ": " + stderr)
            handleError(err)
        }
    })
    p.on("error", (err) => {
        handleError(err)
    })
}
