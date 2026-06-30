document.addEventListener('DOMContentLoaded', function() {
    const jsonInput = document.getElementById('json-input');
    const javaOutput = document.getElementById('java-output');
    const innerClassesOutput = document.getElementById('inner-classes-output');
    const innerClassesSection = document.getElementById('inner-classes-section');
    const convertBtn = document.getElementById('convert-btn');
    const clearBtn = document.getElementById('clear-btn');
    const useInnerClasses = document.getElementById('use-inner-classes');

    // 监听使用内部类复选框变化
    useInnerClasses.addEventListener('change', function() {
        innerClassesSection.style.display = this.checked ? 'none' : 'flex';
    });

    // 转换按钮点击事件
    convertBtn.addEventListener('click', function() {
        try {
            const jsonData = jsonInput.value.trim();
            if (!jsonData) {
                alert('Please enter JSON data');
                return;
            }

            const parsedJson = JSON.parse(jsonData);
            const className = 'MyEntity'; // 默认类名
            const packageName = ''; // 不使用包名
            const withGettersSetters = true; // 默认生成Getter/Setter
            const withToString = false; // 不生成toString方法
            const withInnerClasses = useInnerClasses.checked;

            const result = convertJsonToJava(parsedJson, className, packageName, withGettersSetters, withToString, withInnerClasses);
            
            // 使用公共函数设置代码内容
            setCodeContent('java-output', result.mainClass);
            
            // 如果不使用内部类，则显示内部类部分
            if (!withInnerClasses) {
                setCodeContent('inner-classes-output', result.separateInnerClasses);
                innerClassesSection.style.display = 'flex';
            } else {
                innerClassesSection.style.display = 'none';
            }
        } catch (error) {
            alert('JSON parse error: ' + error.message);
        }
    });

    // 清空按钮点击事件
    clearBtn.addEventListener('click', function() {
        jsonInput.value = '';
        clearCodeContent(['java-output', 'inner-classes-output']);
    });

    // JSON转Java实体函数
    function convertJsonToJava(json, className, packageName, withGettersSetters, withToString, withInnerClasses) {
        let javaCode = '';
        let innerClasses = '';
        let separateInnerClasses = '';
        
        // 添加包名
        if (packageName) {
            javaCode += `package ${packageName};\n\n`;
            if (!withInnerClasses) {
                separateInnerClasses += `package ${packageName};\n\n`;
            }
        }
        
        // 添加导入语句
        javaCode += `import java.util.List;\n`;
        javaCode += `import java.util.Map;\n\n`;
        
        if (!withInnerClasses) {
            separateInnerClasses += `import java.util.List;\n`;
            separateInnerClasses += `import java.util.Map;\n\n`;
        }
        
        // 添加类定义
        javaCode += `public class ${className} {\n`;
        
        // 添加字段
        const fields = [];
        const innerClassesInfo = [];
        
        for (const key in json) {
            if (json.hasOwnProperty(key)) {
                const value = json[key];
                let type = getJavaType(value, key, className);
                const fieldName = toCamelCase(key);
                
                // 处理嵌套对象
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    const innerClassName = capitalize(fieldName);
                    
                    if (withInnerClasses) {
                        type = innerClassName;
                        // 生成内部类
                        const innerClassResult = generateInnerClass(value, innerClassName, withGettersSetters, withToString, withInnerClasses);
                        innerClasses += innerClassResult.classCode;
                    } else {
                        type = innerClassName;
                        // 收集内部类信息，稍后生成单独的类
                        innerClassesInfo.push({
                            className: innerClassName,
                            data: value
                        });
                    }
                }
                
                // 处理数组中的对象
                if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                    const innerClassName = capitalize(getSingular(fieldName));
                    
                    if (withInnerClasses) {
                        type = `List<${innerClassName}>`;
                        // 生成内部类
                        const innerClassResult = generateInnerClass(value[0], innerClassName, withGettersSetters, withToString, withInnerClasses);
                        innerClasses += innerClassResult.classCode;
                    } else {
                        type = `List<${innerClassName}>`;
                        // 收集内部类信息，稍后生成单独的类
                        innerClassesInfo.push({
                            className: innerClassName,
                            data: value[0]
                        });
                    }
                }
                
                fields.push({ name: fieldName, type: type, originalName: key });
                javaCode += `    private ${type} ${fieldName};\n`;
            }
        }
        
        // 添加getter和setter
        if (withGettersSetters) {
            javaCode += '\n';
            fields.forEach(field => {
                const capitalizedName = capitalize(field.name);
                
                // Getter
                javaCode += `    public ${field.type} get${capitalizedName}() {\n`;
                javaCode += `        return ${field.name};\n`;
                javaCode += `    }\n\n`;
                
                // Setter
                javaCode += `    public void set${capitalizedName}(${field.type} ${field.name}) {\n`;
                javaCode += `        this.${field.name} = ${field.name};\n`;
                javaCode += `    }\n\n`;
            });
        }
        
        // 添加toString方法
        if (withToString) {
            javaCode += `    @Override\n`;
            javaCode += `    public String toString() {\n`;
            javaCode += `        return "${className}{" +\n`;
            
            fields.forEach((field, index) => {
                if (index === 0) {
                    javaCode += `                "${field.name}=" + ${field.name}`;
                } else {
                    javaCode += ` +\n                ", ${field.name}=" + ${field.name}`;
                }
            });
            
            javaCode += ` +\n                "}";\n`;
            javaCode += `    }\n`;
        }
        
        // 添加内部类
        if (withInnerClasses) {
            javaCode += innerClasses;
        }
        
        javaCode += `}`;
        
        // 生成单独的内部类文件
        if (!withInnerClasses && innerClassesInfo.length > 0) {
            innerClassesInfo.forEach(info => {
                separateInnerClasses += `public class ${info.className} {\n`;
                
                const innerFields = [];
                for (const key in info.data) {
                    if (info.data.hasOwnProperty(key)) {
                        const value = info.data[key];
                        let type = getJavaType(value, key, info.className);
                        const fieldName = toCamelCase(key);
                        
                        // 处理嵌套对象
                        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                            const nestedClassName = capitalize(fieldName);
                            type = nestedClassName;
                            
                            // 收集内部类信息，稍后生成单独的类
                            innerClassesInfo.push({
                                className: nestedClassName,
                                data: value
                            });
                        }
                        
                        // 处理数组中的对象
                        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                            const nestedClassName = capitalize(getSingular(fieldName));
                            type = `List<${nestedClassName}>`;
                            
                            // 收集内部类信息，稍后生成单独的类
                            innerClassesInfo.push({
                                className: nestedClassName,
                                data: value[0]
                            });
                        }
                        
                        innerFields.push({ name: fieldName, type: type, originalName: key });
                        separateInnerClasses += `    private ${type} ${fieldName};\n`;
                    }
                }
                
                // 添加getter和setter
                if (withGettersSetters) {
                    separateInnerClasses += '\n';
                    innerFields.forEach(field => {
                        const capitalizedName = capitalize(field.name);
                        
                        // Getter
                        separateInnerClasses += `    public ${field.type} get${capitalizedName}() {\n`;
                        separateInnerClasses += `        return ${field.name};\n`;
                        separateInnerClasses += `    }\n\n`;
                        
                        // Setter
                        separateInnerClasses += `    public void set${capitalizedName}(${field.type} ${field.name}) {\n`;
                        separateInnerClasses += `        this.${field.name} = ${field.name};\n`;
                        separateInnerClasses += `    }\n\n`;
                    });
                }
                
                // 添加toString方法
                if (withToString) {
                    separateInnerClasses += `    @Override\n`;
                    separateInnerClasses += `    public String toString() {\n`;
                    separateInnerClasses += `        return "${info.className}{" +\n`;
                    
                    innerFields.forEach((field, index) => {
                        if (index === 0) {
                            separateInnerClasses += `                "${field.name}=" + ${field.name}`;
                        } else {
                            separateInnerClasses += ` +\n                ", ${field.name}=" + ${field.name}`;
                        }
                    });
                    
                    separateInnerClasses += ` +\n                "}";\n`;
                    separateInnerClasses += `    }\n`;
                }
                
                separateInnerClasses += `}\n\n`;
            });
        }
        
        return {
            mainClass: javaCode,
            innerClasses: innerClasses,
            separateInnerClasses: separateInnerClasses
        };
    }

    // 生成内部类
    function generateInnerClass(json, className, withGettersSetters, withToString, withInnerClasses) {
        let classCode = `\n    public static class ${className} {\n`;
        const fields = [];
        let innerClasses = '';
        
        for (const key in json) {
            if (json.hasOwnProperty(key)) {
                const value = json[key];
                let type = getJavaType(value, key, className);
                const fieldName = toCamelCase(key);
                
                // 处理嵌套对象
                if (withInnerClasses && typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    const innerClassName = capitalize(fieldName);
                    type = innerClassName;
                    
                    // 生成内部类
                    const innerClassResult = generateInnerClass(value, innerClassName, withGettersSetters, withToString, withInnerClasses);
                    innerClasses += innerClassResult.classCode;
                }
                
                // 处理数组中的对象
                if (withInnerClasses && Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                    const innerClassName = capitalize(getSingular(fieldName));
                    type = `List<${innerClassName}>`;
                    
                    // 生成内部类
                    const innerClassResult = generateInnerClass(value[0], innerClassName, withGettersSetters, withToString, withInnerClasses);
                    innerClasses += innerClassResult.classCode;
                }
                
                fields.push({ name: fieldName, type: type, originalName: key });
                classCode += `        private ${type} ${fieldName};\n`;
            }
        }
        
        // 添加getter和setter
        if (withGettersSetters) {
            classCode += '\n';
            fields.forEach(field => {
                const capitalizedName = capitalize(field.name);
                
                // Getter
                classCode += `        public ${field.type} get${capitalizedName}() {\n`;
                classCode += `            return ${field.name};\n`;
                classCode += `        }\n\n`;
                
                // Setter
                classCode += `        public void set${capitalizedName}(${field.type} ${field.name}) {\n`;
                classCode += `            this.${field.name} = ${field.name};\n`;
                classCode += `        }\n\n`;
            });
        }
        
        // 添加toString方法
        if (withToString) {
            classCode += `        @Override\n`;
            classCode += `        public String toString() {\n`;
            classCode += `            return "${className}{" +\n`;
            
            fields.forEach((field, index) => {
                if (index === 0) {
                    classCode += `                    "${field.name}=" + ${field.name}`;
                } else {
                    classCode += ` +\n                    ", ${field.name}=" + ${field.name}`;
                }
            });
            
            classCode += ` +\n                    "}";\n`;
            classCode += `        }\n`;
        }
        
        // 添加内部类
        classCode += innerClasses;
        
        classCode += `    }\n`;
        
        return {
            classCode: classCode
        };
    }

    // 获取Java类型
    function getJavaType(value, key, parentClassName) {
        if (value === null) {
            return 'Object';
        }
        
        switch (typeof value) {
            case 'string':
                return 'String';
            case 'number':
                // 检查是否为整数
                if (Number.isInteger(value)) {
                    // 检查是否超出int类型范围（-2147483648 到 2147483647）
                    if (value < -2147483648 || value > 2147483647) {
                        return 'long';
                    }
                    return 'int';
                }
                return 'double';
            case 'boolean':
                return 'boolean';
            case 'object':
                if (Array.isArray(value)) {
                    if (value.length === 0) {
                        return 'List<Object>';
                    }
                    
                    // 获取数组元素的类型
                    let rawItemType = getJavaType(value[0], getSingular(key), parentClassName);
                    
                    // 将基本类型转换为包装类型
                    let itemType = rawItemType;
                    if (rawItemType === 'int') itemType = 'Integer';
                    if (rawItemType === 'long') itemType = 'Long';
                    if (rawItemType === 'double') itemType = 'Double';
                    if (rawItemType === 'boolean') itemType = 'Boolean';
                    if (rawItemType === 'char') itemType = 'Character';
                    if (rawItemType === 'byte') itemType = 'Byte';
                    if (rawItemType === 'short') itemType = 'Short';
                    if (rawItemType === 'float') itemType = 'Float';
                    
                    if (typeof value[0] === 'object' && value[0] !== null && !Array.isArray(value[0])) {
                        return `List<${capitalize(getSingular(key))}>`;
                    }
                    return `List<${itemType}>`;
                }
                return capitalize(key);
            default:
                return 'Object';
        }
    }

    // 转换为驼峰命名
    function toCamelCase(str) {
        return str.replace(/[-_]([a-z])/g, (g) => g[1].toUpperCase());
    }

    // 首字母大写
    function capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    // 获取单数形式
    function getSingular(str) {
        if (str.endsWith('s')) {
            return str.substring(0, str.length - 1);
        }
        return str + 'Item';
    }
});