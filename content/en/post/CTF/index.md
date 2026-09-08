---
title: "bandit实验"                         
author: "Lee"  
description : bandit实验详细记录    
date: 2024-10-06                   
image: "1.jpg"
tags : [                                    
"CTF",
]
series : [
"CTF",
]
categories : [                              
"CTF",
]
keywords : [                                
"实验、CTF",
]
---



**参考博客**：[OverTheWire: Level Goal: Bandit Level 12 → Level 13](https://overthewire.org/wargames/bandit/bandit13.html)

### **level12-13**

主要思路： 先将文件转化为二进制文件，再利用file命令查看文件类型，根据文件类型来解压缩



### **level17-18**

利用diff -a 

### **level18-19**

The password for the next level is stored in a file **readme** in the homedirectory. Unfortunately, someone has modified **.bashrc** to log you out when you log in with SSH.

```bash
ssh -p 2220 bandit18@bandit.labs.overthewire.org cat readme
```

### **level19-20**

setuid，利用bandit20.do文件来提权root

```bash
./bandit20-do  cat /etc/bandit_pass/bandit20
```

### **level20-21**

利用nc -lv 监听端口，再用./suconnect 端口号连接

### **level21-22**

找到对应的crond脚本

### **level22-23**

找到对应脚本,再把bandit23的mytarget找出来，再读取密码

```sh
bandit22@bandit:/etc/cron.d$ cat  /usr/bin/cronjob_bandit23.sh
#!/bin/bash

myname=$(whoami)
mytarget=$(echo I am user $myname | md5sum | cut -d ' ' -f 1)

echo "Copying passwordfile /etc/bandit_pass/$myname to /tmp/$mytarget"

cat /etc/bandit_pass/$myname > /tmp/$mytarget
bandit22@bandit:/etc/cron.d$ echo I am user bandit23 | md5sum | cut -d ' ' -f 1
```

### **level23-24**

找到对应脚本，参考上一个level的脚本，创建一个新的脚本来获取密码，注意文件的权限问题

```sh
#!/bin/bash

cat /etc/bandit_pass/bandit24 > /tmp/bandit24/bandit24
```

### **level24-25**

 **Level Goal**

A daemon is listening on port 30002 and will give you the password for bandit25 if given the password for bandit24 and a secret numeric 4-digit pincode. There is no way to retrieve the pincode except by going through all of the 10000 combinations, called brute-forcing.
You do not need to create new connections each time

tips： nc localhost 30002  利用shell脚本进行爆破

注意程序可能会因为超时卡住，所以要分段爆破

```sh
for i in {0000..9999}
do
	echo "VAfGXJ1PBSsPSnvsjI8p759leLZ9GGar $i" >> ./banditpin
done

cat ./banditpin | nc localhost 30002 >> ./bandit25pass
```

### level25-26

**Level Goal**

Logging in to bandit26 from bandit25 should be fairly easy… The shell for user bandit26 is not **/bin/bash**, but something else. Find out what it is, how it works and how to break out of it.

参考博客：[OverTheWire Bandit Level 25 -> 26 - Walkthrough - MayADevBe Blog](https://mayadevbe.me/posts/overthewire/bandit/level26/)

ls发现目录下有bandit26的私钥，尝试使用ssh -i 进行连接，连接失败，由于/bin/bash被修改。

利用cat  /etc/passwd查看bandit26所使用的shell，发现为/usr/bin/showtext，再查看这个文件，发现它是个脚本，并且通过more打开了text.txt文件，

```bash
bandit25@bandit:~$ cat /etc/passwd | grep bandit26
bandit26:x:11026:11026:bandit level 26:/home/bandit26:/usr/bin/showtext
bandit25@bandit:~$ ls -la /usr/bin/showtext
-rwxr-xr-x 1 root root 53 May  7  2020 /usr/bin/showtext
bandit25@bandit:~$ cat /usr/bin/showtext
#!/bin/sh

export TERM=linux

more ~/text.txt
exit 0
```

再次尝试ssh连接，失败

```bash
$ ssh -i bandit26.sshkey bandit26@localhost
...
  _                     _ _ _   ___   __  
 | |                   | (_) | |__ \ / /  
 | |__   __ _ _ __   __| |_| |_   ) / /_  
 | '_ \ / _` | '_ \ / _` | | __| / / '_ \ 
 | |_) | (_| | | | | (_| | | |_ / /| (_) |
 |_.__/ \__,_|_| |_|\__,_|_|\__|____\___/ 
Connection to bandit.labs.overthewire.org closed.
```

分析原因，如果text.txt文件超过一页，那么more text.txt就会等待翻页，显然，text.txt文件太小，此时需要另辟蹊径，既然文件本身改变不了，那么反过来改变运行窗口的大小也能起到同样的作用。

进入more以后，使用v进入vim编辑模式，再通过":e /etc/bandit_pass_bandit26"得到password。（-e 打开文件）

或者通过:set shell=/bin/bash    :shell 来进入bandit26用户

### level26-27

 **Level Goal**

Good job getting a shell! Now hurry and grab the password for bandit27!

bandit27.do已被setid，所以执行这个文件时会短暂使用root用户权限，借此我们可以执行其它命令。

```bash
bandit26@bandit:~$ ls
bandit27-do  text.txt
bandit26@bandit:~$ ./bandit27-do 
Run a command as another user.
  Example: ./bandit27-do id
bandit26@bandit:~$ ./bandit27-do cat /etc/bandit\_pass/bandit27
3ba3118a22e93127a4ed485be72ef5ea
```

### level27-28

**Level Goal**

There is a git repository at `ssh://bandit27-git@localhost/home/bandit27-git/repo` via the port `2220`. The password for the user `bandit27-git` is the same as for the user `bandit27`.

Clone the repository and find the password for the next level.

在/tmp创建一个目录，接着在目录下git init，再git clone ssh://bandit27-git@localhost:2220/home/bandit27-git/repo，注意端口号。最后读取README文件即成功

password：AVanL161y9rsbcJIsFHuw35rjaOM19nR

### level28-29

**Level Goal**

There is a git repository at `ssh://bandit28-git@localhost/home/bandit28-git/repo` via the port `2220`. The password for the user `bandit28-git` is the same as for the user `bandit28`.

Clone the repository and find the password for the next level.

tips：

- git log，show us the commit log
- git show <commit> show us the content of a commit (when creating a public repository it is important to be aware of  the information you push to it since changes and previous version are saved. So sensitive data, like passwords, could still be retrieved).

克隆远程仓库后发现readme.md文件里没有显示password，无从下手，参考别人的博客发现这两个命令，于是迎刃而解。还是得积累更多的知识。

### level29-30

**Level Goal**
There is a git repository at ssh://bandit29-git@localhost/home/bandit29-git/repo via the port 2220. The password for the user bandit29-git is the same as for the user bandit29.

Clone the repository and find the password for the next level.

参照上个level的流程，发现

```bash
bandit29@bandit:/tmp/bandit29/repo$ cat README.md 
# Bandit Notes
Some notes for bandit30 of bandit.

## credentials

- username: bandit30
- password: <no passwords in production!>
```

production提示我们有其它的环境

于是利用git branch -a查看是否有其它分支，发现dev环境

```bash
bandit29@bandit:/tmp/bandit29/repo$ git branch -a
* master
  remotes/origin/HEAD -> origin/master
  remotes/origin/dev
  remotes/origin/master
  remotes/origin/sploits-dev
```

使用git checkout dev或git switch dev切换分支

```bash
bandit29@bandit:/tmp/bandit29/repo$ git checkout remotes/origin/dev
Note: switching to 'remotes/origin/dev'
```

最后查看仓库，找到密码

```bash
bandit29@bandit:/tmp/bandit29/repo$ ls
code  README.md
bandit29@bandit:/tmp/bandit29/repo$ cat README.md 
# Bandit Notes
Some notes for bandit30 of bandit.

## credentials

- username: bandit30
- password: xbhV3HpNGlTIdnjUrdAlPzc2L6y9EOnS
```

### level30-31

**Level Goal**

There is a git repository at `ssh://bandit30-git@localhost/home/bandit30-git/repo` via the port `2220`. The password for the user `bandit30-git` is the same as for the user `bandit30`.

Clone the repository and find the password for the next level.

与上面几个level的差异是这个level使用git tag来解决

**Git tagging** is a way to mark specific points in the history of the repository. One example would be to mark release points of the software. The command to see the tags is `git tag`. To create a tag the command is `git tag -a <tag_name> -m <"tag description/message">`. To see more details, like the tag message and commit, you can use the following command: `git show <tag_name>`.

```bash
bandit30@bandit:/tmp/tmp.GLR635iQNn/repo$ git tag
secret
bandit30@bandit:/tmp/tmp.GLR635iQNn/repo$ git show secret
OoffzGDlzhAlerFJ2cAiz1D41JW1Mhmt
```

### level31-32

**Level Goal**

There is a git repository at `ssh://bandit31-git@localhost/home/bandit31-git/repo` via the port `2220`. The password for the user `bandit31-git` is the same as for the user `bandit31`.

Clone the repository and find the password for the next level.

Tips

**Git Commit** saves the currently made changes with a message describing these changes. The flag `-a` makes sure all modified/deleted files are staged.

**Git Push** updates local changes in remote repositories. When pushing for the first time, you should also define the branch with `-u`.

**Git Ignore** is a file with the filename ‘.gitignore’. In this file, all file names/extensions that should be ignored by the commit are written. This means if a file which is in the ignore file is created/changed, it will not be part of the commit/repository. Git ignore also allows for wildcards. (*For example, :* ‘*.pyc’ means all files with the ending ‘.pyc’ will be ignored.) There are pre-written files for specific situations and languages, like [this one](https://github.com/github/gitignore/blob/main/Python.gitignore) for Python.

**Git Add** updates what files will be part of the next commit. The `-f` flag forces files to be able to be committed, even when they are normally ignored.

.gitignore用来过滤本地仓库的一些文件或目录，使得在上传至远程仓库时忽略这些文件和目录，具体用法STFW

解法：克隆远程仓库后查看readme.md文件，发现如下提示，按照提示创建key.txt文件，并把'May I come in?'写入，接着push到远程仓库，发现报错，于是修改.gitignore的文件内容使得其能正常push到远程仓库。

```bash
bandit31@bandit:/tmp/bandit31/repo$ cat README.md 
This time your task is to push a file to the remote repository.

Details:
    File name: key.txt
    Content: 'May I come in?'
    Branch: master

bandit31@bandit:/tmp/bandit31/repo$ git add .
bandit31@bandit:/tmp/bandit31/repo$ git commit -a -m"first"
[master 50ed76a] first
 2 files changed, 2 insertions(+), 1 deletion(-)
 create mode 100644 key.txt
Enumerating objects: 6, done.
Counting objects: 100% (6/6), done.
Delta compression using up to 2 threads
Compressing objects: 100% (2/2), done.
Writing objects: 100% (4/4), 331 bytes | 331.00 KiB/s, done.
Total 4 (delta 0), reused 0 (delta 0), pack-reused 0
remote: ### Attempting to validate files... ####
remote: 
remote: .oOo.oOo.oOo.oOo.oOo.oOo.oOo.oOo.oOo.oOo.
remote: 
remote: Well done! Here is the password for the next level:
remote: rmCBvG56y58BXzv98yZGdO7ATVL5dW8y 
remote: 
remote: .oOo.oOo.oOo.oOo.oOo.oOo.oOo.oOo.oOo.oOo.
remote: 
To ssh://localhost:2220/home/bandit31-git/repo

```

### level32-33

After all this `git` stuff its time for another escape. Good luck!

Tips

Linux has **Variables** called local variables (valid in current shell), shell variables (set up by shell) and environment variables (valid systemwide). These variables have their names in uppercase only. They are defined by writing `VAR_NAME=var_value` in the command line. To see the content of a variable, you can write `echo $VAR_NAME`.

To print all environment variables, you can use `printenv`.

Some common that are good to know are:

- `TERM` -  current terminal emulation
- `HOME` - the path to home directory of currently logged in user
- `LANG` - current locales settings
- `PATH` - directory list to be searched when executing commands
- `PWD` - pathname of the current working directory
- `SHELL`/`0` - the path of the current user’s shell
- `USER` - currently logged-in user

解法：因为shell把我们输入的字符全部转换为大写了，所以无法执行正常的指令，大写的字符一般与环境变量有关，\$0表示所使用shell的名字，\$\$表示进程id，通过使用\$0来进入正常shell，接着进入bandit33查看密码

```bash
$ exit
>> $0
$ whoami    
bandit33
$ ls
uppershell
$ cat /etc/bandit_pass/bandit33
odHo63fHiFqcWWJG9rLiLDtPm45KzUKy
```

