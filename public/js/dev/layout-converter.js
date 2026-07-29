document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const xmlInput = document.getElementById('xml-input');
    const convertBtn = document.getElementById('convert-btn');
    const clearBtn = document.getElementById('clear-btn');
    const mPrefixCheckbox = document.getElementById('m-prefix-checkbox');
    const privateCheckbox = document.getElementById('private-checkbox');
    const kotlinCheckbox = document.getElementById('kotlin-checkbox');
    const butterknifeCheckbox = document.getElementById('butterknife-checkbox');

    // 转换按钮点击处理
    convertBtn.addEventListener('click', function() {
        if (!xmlInput.value.trim()) {
            setCodeContent('result-output', "请输入布局XML代码");
            return;
        }
        
        const result = convertXmlToFindViewCode(xmlInput.value);
        setCodeContent('result-output', result);
    });

    // 清空按钮点击处理
    clearBtn.addEventListener('click', function() {
        xmlInput.value = "";
        clearCodeContent(['result-output']);
    });

    // Kotlin和ButterKnife选项互斥处理
    kotlinCheckbox.addEventListener('change', function() {
        if (this.checked) {
            butterknifeCheckbox.checked = false;
        }
    });

    butterknifeCheckbox.addEventListener('change', function() {
        if (this.checked) {
            kotlinCheckbox.checked = false;
        }
    });

    // XML转换为findViewById代码的函数
    function convertXmlToFindViewCode(xmlString) {
        try {
            // 获取选项值
            const addMPrefix = mPrefixCheckbox.checked;
            const usePrivate = privateCheckbox.checked;
            const useKotlin = kotlinCheckbox.checked;
            const useButterKnife = butterknifeCheckbox.checked;

            // 预处理XML，排除命名空间声明
            xmlString = xmlString.replace(/xmlns:android\s*=\s*["']http:\/\/schemas.android.com\/apk\/res\/android["']/g, '');
            
            // 直接使用正则表达式提取ID信息，不使用DOM解析
            const views = [];
            
            // 匹配所有XML标签
            const tagPattern = /<([a-zA-Z][a-zA-Z0-9._-]*)[^>]*>/g;
            let tagMatch;
            
            while ((tagMatch = tagPattern.exec(xmlString)) !== null) {
                const fullTag = tagMatch[0];
                const tagName = tagMatch[1];
                
                // 跳过不需要的标签
                if (tagName === 'root' || tagName === 'div') {
                    continue;
                }
                
                // 提取ID属性
                // 尝试匹配多种格式: android:id="@+id/name", android:id='@+id/name', id="name", id='name'
                const idPattern = /(?:android:)?id\s*=\s*["'](?:@(?:\+)?id\/)?([^"']+)["']/i;
                const idMatch = fullTag.match(idPattern);
                
                if (idMatch) {
                    let idName = idMatch[1];
                    
                    // 应用m前缀
                    if (addMPrefix && !idName.startsWith("m")) {
                        idName = "m" + idName.charAt(0).toUpperCase() + idName.slice(1);
                    }
                    
                    views.push({
                        type: tagName,
                        id: idName,
                        originalId: idMatch[1]
                    });
                    
                    console.log("找到元素:", {
                        tag: tagName,
                        id: idMatch[1],
                        processedId: idName
                    });
                }
            }

            if (views.length === 0) {
                console.log("Debug - 原始XML:", xmlString); 
                return "未找到任何带有ID的View\n\n支持的ID格式示例:\nandroid:id=\"@+id/name\"\nid=\"name\"\n\n请检查XML是否包含ID属性。";
            }

            // 根据不同选项生成代码
            if (useKotlin) {
                return generateKotlinCode(views, usePrivate);
            } else if (useButterKnife) {
                return generateButterKnifeCode(views, usePrivate, addMPrefix);
            } else {
                return generateJavaCode(views, usePrivate, addMPrefix);
            }
        } catch (error) {
            return "错误：" + error.message + "\n\n请输入有效的XML片段。";
        }
    }

    // 生成Java代码
    function generateJavaCode(views, usePrivate, addMPrefix) {
        let result = "";
        
        // 生成变量声明
        views.forEach(view => {
            const modifier = usePrivate ? 'private ' : '';
            result += `${modifier}${view.type} ${view.id};\n`;
        });
        result += "\n";
        
        // 生成findViewById代码
        views.forEach(view => {
            result += `${view.id} = view.findViewById(R.id.${view.originalId});\n`;
        });
        result += "\n";

        // 为每个控件添加点击监听器
        views.forEach(view => {
            result += `${view.id}.setOnClickListener(this);\n`;
        });
        
        // 添加onClick方法实现
        result += "\n@Override\npublic void onClick(View v) {\n    switch (v.getId()) {\n";
        
        // 为每个控件添加case语句
        views.forEach(view => {
            result += `        case R.id.${view.originalId}:\n            \n            break;\n`;
        });
        
        // 关闭switch语句和方法
        result += "    }\n}";

        return result;
    }

    // 生成Kotlin代码
    function generateKotlinCode(views, usePrivate) {
        let result = "";
        
        // 生成属性声明
        views.forEach(view => {
            const modifier = usePrivate ? 'private ' : '';
            result += `${modifier}lateinit var ${view.id}: ${view.type}\n`;
        });
        result += "\n";
        
        // 生成findViewById代码
        views.forEach(view => {
            result += `${view.id} = findViewById(R.id.${view.originalId})\n`;
        });


        return result;
    }

    // 生成ButterKnife代码
    function generateButterKnifeCode(views, usePrivate, addMPrefix) {
        let result = "";
        
        // 生成@BindView注解和变量声明
        views.forEach(view => {
            const modifier = usePrivate ? 'private ' : '';
            result += `@BindView(R.id.${view.originalId})\n${modifier}${view.type} ${view.id};\n`;
        });
        result += "\n";
        
        // 生成@OnClick注解，包含所有控件的ID
        result += "@OnClick({";
        views.forEach((view, index) => {
            result += `R.id.${view.originalId}`;
            if (index < views.length - 1) {
                result += ", ";
            }
        });
        result += "})\n";
        
        // 添加onClick方法实现
        result += "public void onClick(View v) {\n    switch (v.getId()) {\n";
        
        // 为每个控件添加case语句
        views.forEach(view => {
            result += `        case R.id.${view.originalId}:\n            \n            break;\n`;
        });
        
        // 关闭switch语句和方法
        result += "    }\n}";
        
        return result;
    }
}); 